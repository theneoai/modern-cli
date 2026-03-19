/**
 * Modal Context - 弹窗管理系统
 * 提供统一的弹窗层级管理和队列控制
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { FocusLayer } from './FocusContext.js';

// ============================================================================
// Types
// ============================================================================

export enum ModalType {
  MODAL = 'modal',           // 普通模态框
  DIALOG = 'dialog',         // 对话框 (有遮罩)
  POPOVER = 'popover',       // 弹出菜单
  PALETTE = 'palette',       // 命令面板
  CONFIRM = 'confirm',       // 确认框
  INPUT = 'input',           // 输入框
}

export interface ModalConfig {
  id: string;
  type: ModalType;
  title?: string;
  content: React.ReactNode;
  width?: number;
  height?: number;
  position?: 'center' | 'top' | 'bottom';
  showOverlay?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
}

export interface ModalState extends ModalConfig {
  isOpen: boolean;
  layer: FocusLayer;
  openedAt: number;
}

export interface ModalContextValue {
  // 当前弹窗状态
  modals: ModalState[];
  activeModal: ModalState | null;
  hasOpenModal: boolean;
  
  // 打开弹窗
  openModal: (config: Omit<ModalConfig, 'id'>) => string;
  openConfirm: (options: ConfirmOptions) => string;
  openInput: (options: InputOptions) => string;
  openPalette: (options: PaletteOptions) => string;
  
  // 关闭弹窗
  closeModal: (id: string) => void;
  closeAll: () => void;
  closeActive: () => void;
  
  // 聚焦
  bringToFront: (id: string) => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'info' | 'warning' | 'danger';
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface InputOptions {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  validate?: (value: string) => string | null; // returns error message or null
}

export interface PaletteOptions {
  items: PaletteItem[];
  placeholder?: string;
  onSelect: (item: PaletteItem) => void;
  onCancel?: () => void;
}

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  disabled?: boolean;
}

// ============================================================================
// Context
// ============================================================================

const ModalContext = createContext<ModalContextValue | null>(null);

// ============================================================================
// Helper Functions
// ============================================================================

function getLayerForType(type: ModalType): FocusLayer {
  switch (type) {
    case ModalType.POPOVER:
      return FocusLayer.OVERLAY;
    case ModalType.PALETTE:
      return FocusLayer.DIALOG;
    case ModalType.CONFIRM:
    case ModalType.INPUT:
      return FocusLayer.DIALOG;
    case ModalType.DIALOG:
      return FocusLayer.DIALOG;
    case ModalType.MODAL:
    default:
      return FocusLayer.MODAL;
  }
}

function generateId(): string {
  return `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Provider Component
// ============================================================================

interface ModalProviderProps {
  children: React.ReactNode;
  maxModals?: number;
}

export function ModalProvider({ children, maxModals = 3 }: ModalProviderProps) {
  const [modals, setModals] = useState<ModalState[]>([]);
  
  // Get active (top-most) modal
  const activeModal = useMemo(() => {
    if (modals.length === 0) return null;
    return modals[modals.length - 1];
  }, [modals]);
  
  const hasOpenModal = modals.length > 0;
  
  // Open a new modal
  const openModal = useCallback((config: Omit<ModalConfig, 'id'>): string => {
    const id = generateId();
    
    const newModal: ModalState = {
      ...config,
      id,
      isOpen: true,
      layer: getLayerForType(config.type),
      openedAt: Date.now(),
    };
    
    setModals(prev => {
      // Close oldest modals if exceeding max
      let updated = [...prev, newModal];
      if (updated.length > maxModals) {
        const toClose = updated.slice(0, updated.length - maxModals);
        toClose.forEach(m => m.onClose?.());
        updated = updated.slice(-maxModals);
      }
      return updated;
    });
    
    config.onOpen?.();
    return id;
  }, [maxModals]);
  
  // Open confirm dialog
  const openConfirm = useCallback((options: ConfirmOptions): string => {
    // Import dynamically to avoid circular dependency
    const { ConfirmDialogContent } = require('../components/modal/ConfirmDialogContent.js');
    
    return openModal({
      type: ModalType.CONFIRM,
      title: options.title,
      content: React.createElement(ConfirmDialogContent, { ...options }),
      width: 50,
      height: 10,
      position: 'center',
      showOverlay: true,
      closeOnEsc: true,
      onClose: options.onCancel,
    });
  }, [openModal]);
  
  // Open input dialog
  const openInput = useCallback((options: InputOptions): string => {
    const { InputDialogContent } = require('../components/modal/InputDialogContent.js');
    
    return openModal({
      type: ModalType.INPUT,
      title: options.title,
      content: React.createElement(InputDialogContent, { ...options }),
      width: 60,
      height: 8,
      position: 'center',
      showOverlay: true,
      closeOnEsc: true,
    });
  }, [openModal]);
  
  // Open command palette
  const openPalette = useCallback((options: PaletteOptions): string => {
    const { CommandPaletteContent } = require('../components/modal/CommandPaletteContent.js');
    
    return openModal({
      type: ModalType.PALETTE,
      title: 'Command Palette',
      content: React.createElement(CommandPaletteContent, { ...options }),
      width: 70,
      height: 20,
      position: 'top',
      showOverlay: true,
      closeOnEsc: true,
      closeOnOverlayClick: true,
    });
  }, [openModal]);
  
  // Close a specific modal
  const closeModal = useCallback((id: string) => {
    setModals(prev => {
      const modal = prev.find(m => m.id === id);
      if (modal) {
        modal.onClose?.();
      }
      return prev.filter(m => m.id !== id);
    });
  }, []);
  
  // Close all modals
  const closeAll = useCallback(() => {
    modals.forEach(m => m.onClose?.());
    setModals([]);
  }, [modals]);
  
  // Close active modal
  const closeActive = useCallback(() => {
    if (activeModal) {
      closeModal(activeModal.id);
    }
  }, [activeModal, closeModal]);
  
  // Bring modal to front
  const bringToFront = useCallback((id: string) => {
    setModals(prev => {
      const modal = prev.find(m => m.id === id);
      if (!modal) return prev;
      
      const others = prev.filter(m => m.id !== id);
      return [...others, { ...modal, openedAt: Date.now() }];
    });
  }, []);
  
  // Context value
  const value = useMemo<ModalContextValue>(() => ({
    modals,
    activeModal,
    hasOpenModal,
    openModal,
    openConfirm,
    openInput,
    openPalette,
    closeModal,
    closeAll,
    closeActive,
    bringToFront,
  }), [
    modals, activeModal, hasOpenModal,
    openModal, openConfirm, openInput, openPalette,
    closeModal, closeAll, closeActive, bringToFront,
  ]);
  
  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
