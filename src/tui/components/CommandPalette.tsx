import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { tuiTheme as theme, icons } from '../../theme/index.js';

interface CommandPaletteProps {
  onSelect: (command: string) => void;
  onClose: () => void;
  width?: number;
  height?: number;
}

interface CommandItem {
  label: string;
  value: string;
  description: string;
  icon: string;
  category: string;
}

const commands: CommandItem[] = [
  { label: 'View Calendar', value: '/calendar', description: 'Show full calendar', icon: icons.calendar, category: 'Google' },
  { label: 'View Emails', value: '/emails', description: 'Show all emails', icon: icons.email, category: 'Google' },
  { label: 'View Meetings', value: '/meetings', description: 'Show all meetings', icon: icons.meeting, category: 'Google' },
  { label: 'Refresh Data', value: '/refresh', description: 'Sync Google data', icon: '↻', category: 'Google' },
  { label: 'View Tasks', value: '/tasks', description: 'Show all tasks', icon: icons.check, category: 'Tasks' },
  { label: 'Create Task', value: '/task add ', description: 'Add new task', icon: icons.add, category: 'Tasks' },
  { label: 'Agent List', value: '/agents', description: 'List all agents', icon: icons.agent, category: 'Agents' },
  { label: 'Organization', value: '/orgs', description: 'List organizations', icon: icons.building, category: 'Orgs' },
  { label: 'Help', value: '/help', description: 'Show help', icon: '❓', category: 'System' },
  { label: 'Clear Screen', value: '/clear', description: 'Clear terminal', icon: '🧹', category: 'System' },
  { label: 'Exit', value: '/exit', description: 'Exit NEO', icon: '🚪', category: 'System' },
];

/**
 * Highlight matching text in a string
 */
function HighlightedText({ text, query, highlightColor }: { text: string; query: string; highlightColor: string }) {
  if (!query) {
    return <Text>{text}</Text>;
  }
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  
  return (
    <Text>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === query.toLowerCase();
        return isMatch ? (
          <Text key={i} color={theme.colors.background} backgroundColor={highlightColor} bold>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        );
      })}
    </Text>
  );
}

export function CommandPalette({ onSelect, onClose, width = 60, height = 20 }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    
    const query = search.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    );
  }, [search]);

  // Reset selection when search changes
  useMemo(() => {
    setSelectedIndex(0);
  }, [search]);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
      return;
    }
    
    if (key.return) {
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        onSelect(cmd.value);
      }
      return;
    }
  });

  const visibleCommands = filteredCommands.slice(0, height - 7);
  const hasMore = filteredCommands.length > visibleCommands.length;

  return (
    <Box 
      position="absolute" 
      marginLeft={Math.max(0, Math.floor((80 - width) / 4))}
      marginTop={Math.max(0, Math.floor((24 - height) / 3))}
      width={width} 
      height={height}
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
      flexDirection="column"
      padding={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          {icons.search} Command Palette
        </Text>
        <Text color={theme.colors.muted}> ({filteredCommands.length} commands)</Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={search}
          onChange={setSearch}
          placeholder="Type to search..."
          focus={true}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleCommands.length === 0 ? (
          <Box paddingY={1}>
            <Text color={theme.colors.muted} italic>
              No commands match "{search}"
            </Text>
          </Box>
        ) : (
          visibleCommands.map((cmd, index) => {
            const isSelected = index === selectedIndex;
            const bgColor = isSelected ? theme.colors.primary : undefined;
            const textColor = isSelected ? theme.colors.background : theme.colors.text;
            const descColor = isSelected ? theme.colors.background : theme.colors.muted;
            
            return (
              <Box 
                key={cmd.value}
                paddingY={0.5}
                paddingX={1}
                backgroundColor={bgColor}
              >
                <Text color={textColor}>
                  {cmd.icon} {' '}
                  <HighlightedText 
                    text={cmd.label} 
                    query={search} 
                    highlightColor={isSelected ? theme.colors.accent : theme.colors.primary}
                  />
                  <Text color={descColor}>
                    {' '} - {' '}
                    <HighlightedText 
                      text={cmd.description} 
                      query={search}
                      highlightColor={isSelected ? theme.colors.accent : theme.colors.primary}
                    />
                  </Text>
                  {!search && (
                    <Text color={isSelected ? theme.colors.background : theme.colors.border}>
                      {' '}({cmd.category})
                    </Text>
                  )}
                </Text>
              </Box>
            );
          })
        )}
        {hasMore && (
          <Box paddingY={0.5}>
            <Text color={theme.colors.muted} italic>
              +{filteredCommands.length - visibleCommands.length} more...
            </Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} borderTop borderColor={theme.colors.border} paddingTop={1}>
        <Text color={theme.colors.muted}>
          ↑↓ Navigate | Enter Select | ESC Close
        </Text>
      </Box>
    </Box>
  );
}
