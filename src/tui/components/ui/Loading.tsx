/**
 * Loading - 加载组件
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { tuiTheme, icons } from '../../../theme/index.js';

export interface LoadingProps {
  message?: string;
  spinner?: boolean;
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Loading({ message = 'Loading...', spinner = true }: LoadingProps) {
  const [frame, setFrame] = useState(0);
  
  useEffect(() => {
    if (!spinner) return;
    
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 80);
    
    return () => clearInterval(interval);
  }, [spinner]);
  
  return (
    <Box>
      {spinner && (
        <Text color={tuiTheme.colors.primary}>
          {spinnerFrames[frame]}{' '}
        </Text>
      )}
      <Text color={tuiTheme.colors.text}>
        {message}
      </Text>
    </Box>
  );
}

export interface LoadingOverlayProps extends LoadingProps {
  width?: number;
  height?: number;
}

export function LoadingOverlay({ message, width = 30, height = 3 }: LoadingOverlayProps) {
  return (
    <Box
      width={width}
      height={height}
      borderStyle="round"
      borderColor={tuiTheme.colors.primary}
      justifyContent="center"
      alignItems="center"
    >
      <Loading message={message} />
    </Box>
  );
}

export interface SkeletonProps {
  width?: number;
  lines?: number;
}

export function Skeleton({ width = 20, lines = 3 }: SkeletonProps) {
  return (
    <Box flexDirection="column">
      {Array.from({ length: lines }).map((_, i) => (
        <Box key={i} marginY={0.5}>
          <Text color={tuiTheme.colors.muted}>
            {'█'.repeat(Math.max(5, width - i * 2))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export interface ProgressBarProps {
  progress: number; // 0-100
  width?: number;
  showPercentage?: boolean;
}

export function ProgressBar({ progress, width = 30, showPercentage = true }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const filled = Math.round((clampedProgress / 100) * width);
  const empty = width - filled;
  
  return (
    <Box>
      <Text color={tuiTheme.colors.primary}>
        {'█'.repeat(filled)}
      </Text>
      <Text color={tuiTheme.colors.muted}>
        {'░'.repeat(empty)}
      </Text>
      {showPercentage && (
        <Text color={tuiTheme.colors.text}>
          {' '}{clampedProgress}%
        </Text>
      )}
    </Box>
  );
}

export interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <Box flexDirection="column">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        
        return (
          <Box key={step} marginY={0.5}>
            <Text color={
              isActive ? tuiTheme.colors.primary :
              isCompleted ? tuiTheme.colors.success :
              tuiTheme.colors.muted
            }>
              {isCompleted ? icons.checkHeavy : isActive ? icons.inProgress : icons.pending}
              {' '}{step}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
