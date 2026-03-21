/**
 * ModelSelector.tsx — 模型 / Provider 选择面板
 *
 * 触发: Ctrl+M
 *
 * 功能:
 *   - 列出所有 provider + 其模型
 *   - 显示当前活跃 provider/model (高亮)
 *   - 切换时自动保存上下文、切回时恢复
 *   - 显示模型价格、上下文窗口、能力标签
 *   - /key add/list/rm 命令集成提示
 *
 * 布局:
 *   左栏 (35%): Provider 列表
 *   右栏 (65%): 选中 provider 的模型列表 + key 状态
 *
 * 键盘:
 *   j/k    导航    Tab  切换左右栏
 *   Enter  切换到选中模型
 *   ESC    关闭
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import { PROVIDERS, type ProviderDef, type ModelDef } from '../../ai/providers/registry.js';
import { keyStore } from '../../ai/keystore.js';
import { getConfig } from '../../utils/config.js';

interface ModelSelectorProps {
  width: number;
  height: number;
  onSelect: (providerId: string, modelId: string) => void;
  onClose: () => void;
}

export function ModelSelector({ width, height, onSelect, onClose }: ModelSelectorProps) {
  const cfg = getConfig();
  const [pane, setPane] = useState<'providers' | 'models'>('providers');
  const [providerCursor, setProviderCursor] = useState(0);
  const [modelCursor, setModelCursor] = useState(0);

  const providers = Object.values(PROVIDERS);

  // Init cursor to active provider
  useEffect(() => {
    const idx = providers.findIndex(p => p.id === cfg.provider);
    if (idx >= 0) setProviderCursor(idx);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProvider = providers[providerCursor];
  const models = selectedProvider?.models ?? [];

  // Reset model cursor when provider changes
  useEffect(() => {
    if (selectedProvider?.id === cfg.provider) {
      const mi = models.findIndex(m => m.id === cfg.model);
      setModelCursor(Math.max(0, mi));
    } else {
      const mi = models.findIndex(m => m.recommended);
      setModelCursor(Math.max(0, mi));
    }
  }, [providerCursor]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((ch, key) => {
    if (key.escape || ch === 'q') { onClose(); return; }
    if (key.tab) { setPane(p => p === 'providers' ? 'models' : 'providers'); return; }

    if (pane === 'providers') {
      if (key.upArrow || ch === 'k') setProviderCursor(p => Math.max(0, p - 1));
      else if (key.downArrow || ch === 'j') setProviderCursor(p => Math.min(providers.length - 1, p + 1));
      else if (key.return || key.rightArrow) setPane('models');
    } else {
      if (key.upArrow || ch === 'k') setModelCursor(p => Math.max(0, p - 1));
      else if (key.downArrow || ch === 'j') setModelCursor(p => Math.min(models.length - 1, p + 1));
      else if (key.leftArrow) setPane('providers');
      else if (key.return) {
        const m = models[modelCursor];
        if (m && selectedProvider) {
          onSelect(selectedProvider.id, m.id);
          onClose();
        }
      }
    }
  });

  const leftW = Math.floor(width * 0.34);
  const rightW = width - leftW - 3;
  const innerH = height - 4;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="double"
      borderColor={theme.colors.primary}
      position="absolute"
      marginTop={1}
      marginLeft={2}
    >
      {/* Header */}
      <Box height={1} flexShrink={0} paddingX={1} justifyContent="space-between">
        <Text color={theme.colors.primary} bold>◆ 模型选择</Text>
        <Text color={theme.colors.muted}>
          当前: <Text color={theme.colors.accent}>{cfg.provider}/{cfg.model}</Text>
        </Text>
        <Text color={theme.colors.muted}>Tab:切换栏  Enter:选择  ESC:关闭</Text>
      </Box>

      {/* Split pane */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left: Provider list */}
        <Box
          flexDirection="column" width={leftW}
          borderStyle="single"
          borderColor={pane === 'providers' ? theme.colors.primary : theme.colors.border}
          paddingX={1}
        >
          <Text color={theme.colors.muted} bold>Provider</Text>
          {providers.slice(0, innerH - 1).map((p, i) => {
            const hasKey = keyStore.hasKey(p.id);
            const isActive = p.id === cfg.provider;
            const isSel = i === providerCursor && pane === 'providers';
            return (
              <Box key={p.id}
                backgroundColor={isSel ? theme.colors.surfaceLight : undefined}
                paddingX={isSel ? 1 : 0}
              >
                <Text color={isActive ? theme.colors.primary : isSel ? theme.colors.text : theme.colors.muted} bold={isActive || isSel}>
                  {isActive ? '● ' : isSel ? '▸ ' : '  '}
                  {p.name}
                </Text>
                <Text color={hasKey ? theme.colors.success : theme.colors.error}>
                  {hasKey ? ' ✓' : ' ✗'}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Right: Model list + detail */}
        <Box
          flexDirection="column" flexGrow={1}
          borderStyle="single"
          borderColor={pane === 'models' ? theme.colors.primary : theme.colors.border}
          paddingX={1}
        >
          {selectedProvider && (
            <>
              <Box height={1} flexShrink={0}>
                <Text color={theme.colors.muted} bold>{selectedProvider.name}</Text>
                <Text color={theme.colors.muted}>  {selectedProvider.description}</Text>
              </Box>

              {/* API key status */}
              <KeyStatus provider={selectedProvider} />

              {/* Model list */}
              {models.slice(0, innerH - 4).map((m, i) => {
                const isSel = i === modelCursor && pane === 'models';
                const isActive = selectedProvider.id === cfg.provider && m.id === cfg.model;
                return (
                  <ModelRow
                    key={m.id}
                    model={m}
                    isSelected={isSel}
                    isActive={isActive}
                    width={rightW}
                  />
                );
              })}
            </>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text color={theme.colors.muted}>
          ✓ = key 已配置  ✗ = 未配置   /key add {selectedProvider?.id ?? '<provider>'} <api-key>
        </Text>
      </Box>
    </Box>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KeyStatus({ provider }: { provider: ProviderDef }) {
  const hasKey = keyStore.hasKey(provider.id);
  const envVar = provider.apiKeyEnvVar;

  if (!provider.requiresKey) {
    return (
      <Box height={1} flexShrink={0}>
        <Text color={theme.colors.success}>✓ 无需 API Key (本地运行)</Text>
      </Box>
    );
  }
  if (hasKey) {
    const keys = keyStore.listKeys('configure');
    const activeKey = keys.find(k => k.providerId === provider.id && k.active);
    return (
      <Box height={1} flexShrink={0}>
        <Text color={theme.colors.success}>✓ Key 已配置</Text>
        {activeKey && <Text color={theme.colors.muted}> {activeKey.label} ({activeKey.hint})</Text>}
      </Box>
    );
  }
  return (
    <Box height={1} flexShrink={0}>
      <Text color={theme.colors.error}>✗ 未配置 Key  </Text>
      <Text color={theme.colors.muted}>
        {envVar ? `设置 ${envVar} 或 ` : ''}
        运行 /key add {provider.id} &lt;key&gt;
      </Text>
    </Box>
  );
}

function ModelRow({ model, isSelected, isActive, width }: {
  model: ModelDef;
  isSelected: boolean;
  isActive: boolean;
  width: number;
}) {
  const capStr = model.capabilities.slice(0, 4).join(' ');
  const ctxStr = model.contextWindow >= 1_000_000
    ? `${Math.floor(model.contextWindow / 1_000_000)}M`
    : `${Math.floor(model.contextWindow / 1000)}k`;
  const priceStr = model.inputPrice != null
    ? `$${model.inputPrice}/$${model.outputPrice ?? model.inputPrice}/M`
    : '免费';

  return (
    <Box
      paddingX={isSelected ? 1 : 0}
      backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
    >
      <Text color={isActive ? theme.colors.primary : isSelected ? theme.colors.text : theme.colors.muted}
        bold={isActive || isSelected}>
        {isActive ? '● ' : isSelected ? '▸ ' : '  '}
        {model.name}
        {model.recommended && <Text color={theme.colors.warning}> ★</Text>}
      </Text>
      <Text color={theme.colors.muted}>
        {'  '}{ctxStr}  {priceStr}  {capStr}
      </Text>
    </Box>
  );
}
