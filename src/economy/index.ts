/**
 * Economy System - Currency, transactions, and market simulation
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import type { Transaction } from '../types/index.js';

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerType: 'agent' | 'org';
  service: string;
  description: string;
  price: number;
  currency: string;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}

export function createTransaction(data: Omit<Transaction, 'id' | 'timestamp'>): Transaction {
  const tx: Transaction = {
    id: uuidv4(),
    ...data,
    timestamp: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO transactions (id, from_agent, to_agent, from_org, to_org, amount, currency, type, description, metadata, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tx.id, tx.fromAgentId, tx.toAgentId, tx.fromOrgId, tx.toOrgId,
    tx.amount, tx.currency, tx.type, tx.description,
    JSON.stringify(tx.metadata), tx.timestamp.toISOString()
  );

  events.emit('economy.transaction', {
    txId: tx.id, from: tx.fromAgentId || tx.fromOrgId,
    to: tx.toAgentId || tx.toOrgId, amount: tx.amount, type: tx.type,
  });

  return tx;
}

export function paySalary(orgId: string, agentId: string, amount: number, currency: string = 'HTC'): Transaction {
  return createTransaction({
    fromOrgId: orgId, toAgentId: agentId, amount, currency,
    type: 'salary', description: 'Monthly salary payment',
  });
}

export function getBalance(entityId: string, entityType: 'agent' | 'org', currency: string = 'HTC'): number {
  const db = getDB();
  if (entityType === 'agent') {
    const received = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE to_agent = ? AND currency = ?`).get(entityId, currency) as { total: number };
    const sent = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE from_agent = ? AND currency = ?`).get(entityId, currency) as { total: number };
    return received.total - sent.total;
  } else {
    const received = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE to_org = ? AND currency = ?`).get(entityId, currency) as { total: number };
    const sent = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE from_org = ? AND currency = ?`).get(entityId, currency) as { total: number };
    return received.total - sent.total;
  }
}

const marketListings: Map<string, MarketListing> = new Map();

export function createListing(sellerId: string, sellerType: 'agent' | 'org', service: string, description: string, price: number, currency: string = 'HTC'): MarketListing {
  const listing: MarketListing = {
    id: uuidv4(), sellerId, sellerType, service, description, price, currency, status: 'active', createdAt: new Date(),
  };
  marketListings.set(listing.id, listing);
  return listing;
}

export function getListings(): MarketListing[] {
  return Array.from(marketListings.values()).filter(l => l.status === 'active');
}

// function _deserializeTransaction(row: any): Transaction {
//   return {
//     id: row.id, fromAgentId: row.from_agent, toAgentId: row.to_agent, fromOrgId: row.from_org, toOrgId: row.to_org,
//     amount: row.amount, currency: row.currency, type: row.type, description: row.description,
//     metadata: JSON.parse(row.metadata || '{}'), timestamp: new Date(row.timestamp),
//   };
// }
