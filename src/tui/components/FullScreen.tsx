import React, { useEffect } from 'react';
import { useStdout, useInput } from 'ink';

interface FullScreenProps {
  children: React.ReactNode;
  onReset?: () => void;
}

/**
 * FullScreen component that:
 * 1. Clears the terminal
 * 2. Enables alternate screen buffer
 * 3. Hides the cursor
 * 4. Restores everything on unmount
 */
export function FullScreen({ children, onReset }: FullScreenProps) {
  const { stdout } = useStdout();

  // Handle reset key
  useInput((input) => {
    if ((input === 'r' || input === 'R') && onReset) {
      onReset();
    }
  });

  useEffect(() => {
    // Enter alternate screen buffer
    stdout.write('\u001B[?1049h');
    
    // Hide cursor
    stdout.write('\u001B[?25l');
    
    // Clear screen
    stdout.write('\u001B[2J\u001B[H');
    
    // Enable mouse support (optional, for clickable elements)
    stdout.write('\u001B[?1000h\u001B[?1002h\u001B[?1015h\u001B[?1006h');

    // Cleanup function
    return () => {
      // Disable mouse support
      stdout.write('\u001B[?1006l\u001B[?1015l\u001B[?1002l\u001B[?1000l');
      
      // Show cursor
      stdout.write('\u001B[?25h');
      
      // Exit alternate screen buffer
      stdout.write('\u001B[?1049l');
    };
  }, [stdout]);

  return <>{children}</>;
}
