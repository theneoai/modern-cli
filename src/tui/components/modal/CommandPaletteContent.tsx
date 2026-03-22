/**
 * CommandPaletteContent - 命令面板内容组件
 */

import { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import type { PaletteOptions } from '../../contexts/ModalContext.js';
import { useModal } from '../../contexts/ModalContext.js';

// ============================================================================
// Component
// ============================================================================

export function CommandPaletteContent(options: PaletteOptions) {
  const { items, placeholder = 'Type to search...', onSelect, onCancel } = options;
  const { closeActive } = useModal();
  
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items.filter(item => !item.disabled);
    
    const query = search.toLowerCase();
    return items.filter(item => 
      !item.disabled && (
        item.label.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query)
      )
    );
  }, [items, search]);
  
  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);
  
  // Handle keyboard input
  useInput((_input, key) => {
    if (key.escape) {
      closeActive();
      onCancel?.();
      return;
    }
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filteredItems.length - 1, prev + 1));
      return;
    }
    
    if (key.return) {
      const item = filteredItems[selectedIndex];
      if (item) {
        closeActive();
        onSelect(item);
      }
      return;
    }
  });
  
  const visibleItems = filteredItems.slice(0, 12);
  const hasMore = filteredItems.length > visibleItems.length;
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Search input */}
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          {icons.search} Command Palette
        </Text>
        <Text color={theme.colors.muted}> ({filteredItems.length})</Text>
      </Box>
      
      <Box marginBottom={1}>
        <TextInput
          value={search}
          onChange={setSearch}
          placeholder={placeholder}
          focus={true}
        />
      </Box>
      
      {/* Items list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleItems.length === 0 ? (
          <Text color={theme.colors.muted} italic>
            No commands match "{search}"
          </Text>
        ) : (
          visibleItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const bgColor = isSelected ? theme.colors.primary : undefined;
            const textColor = isSelected ? theme.colors.background : theme.colors.text;
            const descColor = isSelected ? theme.colors.background : theme.colors.muted;
            
            return (
              <Box 
                key={item.id}
                paddingY={0.5}
                paddingX={1}
                backgroundColor={bgColor}
              >
                <Text color={textColor}>
                  {item.icon && `${item.icon} `}
                  {item.label}
                  {item.description && (
                    <Text color={descColor}> - {item.description}</Text>
                  )}
                  {!search && item.category && (
                    <Text color={isSelected ? theme.colors.background : theme.colors.border}>
                      {' '}({item.category})
                    </Text>
                  )}
                </Text>
              </Box>
            );
          })
        )}
        
        {hasMore && (
          <Text color={theme.colors.muted} italic>
            +{filteredItems.length - visibleItems.length} more...
          </Text>
        )}
      </Box>
      
      {/* Footer hint */}
      <Box marginTop={1} borderTop borderColor={theme.colors.border} paddingTop={1}>
        <Text color={theme.colors.muted}>
          ↑↓ Navigate | Enter Select | ESC Close
        </Text>
      </Box>
    </Box>
  );
}


