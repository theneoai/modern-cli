/**
 * ModalContainer - 弹窗容器组件
 * 管理弹窗层级和遮罩
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../../theme/index.js';
import { useModal, type ModalState } from '../../contexts/ModalContext.js';

// ============================================================================
// Component
// ============================================================================

export function ModalContainer() {
  const { modals, activeModal, closeActive } = useModal();
  
  // Handle ESC key
  useInput((_input, key) => {
    if (key.escape && activeModal?.closeOnEsc) {
      closeActive();
    }
  });
  
  if (modals.length === 0) {
    return null;
  }
  
  return (
    <>
      {/* Render all modals in order */}
      {modals.map((modal, index) => (
        <ModalWindow 
          key={modal.id} 
          modal={modal} 
          isActive={modal.id === activeModal?.id}
          zIndex={index}
        />
      ))}
    </>
  );
}

// ============================================================================
// Individual Modal Window
// ============================================================================

interface ModalWindowProps {
  modal: ModalState;
  isActive: boolean;
  zIndex: number;
}

function ModalWindow({ modal, isActive, zIndex }: ModalWindowProps) {
  const { closeModal } = useModal();
  
  const positionStyles = useMemo(() => {
    switch (modal.position) {
      case 'top':
        return { marginTop: 2 };
      case 'bottom':
        return { marginBottom: 2 };
      case 'center':
      default:
        return { marginTop: Math.max(2, Math.floor(12 - (modal.height || 10) / 2)) };
    }
  }, [modal.position, modal.height]);
  
  const width = modal.width || 60;
  const height = modal.height || 15;
  
  return (
    <Box 
      position="absolute"
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="flex-start"
      {...positionStyles}
    >
      {/* Overlay (only for active modal) */}
      {modal.showOverlay && isActive && (
        <Overlay onClick={modal.closeOnOverlayClick ? () => closeModal(modal.id) : undefined} />
      )}
      
      {/* Modal content */}
      <Box
        width={width}
        height={height}
        borderStyle="double"
        borderColor={isActive ? theme.colors.primary : theme.colors.border}
        backgroundColor={theme.colors.surface}
        flexDirection="column"
        zIndex={zIndex + 10}
      >
        {/* Title bar */}
        {modal.title && (
          <Box 
            height={1} 
            paddingX={1}
            borderBottom
            borderStyle="single"
            borderColor={theme.colors.border}
          >
            <Text color={theme.colors.primary} bold>
              {modal.title}
            </Text>
          </Box>
        )}
        
        {/* Content */}
        <Box flexGrow={1} overflow="hidden">
          {modal.content}
        </Box>
      </Box>
    </Box>
  );
}

// ============================================================================
// Overlay Component
// ============================================================================

interface OverlayProps {
  onClick?: () => void;
}

function Overlay({ onClick: _onClick }: OverlayProps) {
  // Use a semi-transparent background effect
  return (
    <Box 
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor={theme.colors.background}
    >
      {/* In terminal, we can't do true transparency, so we just render nothing */}
    </Box>
  );
}

// ============================================================================
// Modal Content Wrapper
// ============================================================================

export interface ModalContentProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  padding?: number;
}

export function ModalContent({ children, footer, padding = 1 }: ModalContentProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1} padding={padding}>
        {children}
      </Box>
      {footer && (
        <Box 
          height={1} 
          paddingX={1}
          borderTop
          borderStyle="single"
          borderColor={theme.colors.border}
        >
          {footer}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Modal Actions Component
// ============================================================================

export interface ModalActionsProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function ModalActions({ children, align = 'right' }: ModalActionsProps) {
  const justifyContent = useMemo(() => {
    switch (align) {
      case 'left': return 'flex-start';
      case 'center': return 'center';
      case 'right': return 'flex-end';
      default: return 'flex-end';
    }
  }, [align]);
  
  return (
    <Box justifyContent={justifyContent}>
      {children}
    </Box>
  );
}

// ============================================================================
// Modal Button Component
// ============================================================================

export interface ModalButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function ModalButton({ label, onClick: _onClick, variant = 'secondary', disabled = false }: ModalButtonProps) {
  const color = useMemo(() => {
    switch (variant) {
      case 'primary': return theme.colors.primary;
      case 'danger': return theme.colors.error;
      case 'secondary':
      default: return theme.colors.muted;
    }
  }, [variant]);
  
  return (
    <Box marginLeft={1}>
      <Text 
        color={disabled ? theme.colors.muted : color}
        bold={variant === 'primary'}
      >
        [{label}]
      </Text>
    </Box>
  );
}
