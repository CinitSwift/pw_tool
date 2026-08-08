import { useEffect, useMemo, useRef, useState } from 'react';
import type { PwToolApi } from '../../../preload/api';
import type { AppSettings, BillingMode } from '../../../shared/domain/types';
import './settings.css';

interface Props {
  api: PwToolApi;
}

type DraftSettings = {
  billingMode: BillingMode;
  hourlyRateYuan: string;
  hourlyCommissionYuan: string;
  miniAlwaysOnTop: boolean;
  mainWindowBounds?: AppSettings['mainWindowBounds'];
};

const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  '15-step': '15 分钟阶梯档',
  '15-floor': '15 分钟起算档',
  minute: '1 分钟档',
};

const DEFAULT_SETTINGS: AppSettings = {
  billingMode: '15-step',
  hourlyRateYuan: 40,
  hourlyCommissionYuan: 3,
  miniAlwaysOnTop: false,
};

function normalizeSettings(settings?: AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    mainWindowBounds: settings?.mainWindowBounds,
  };
}

function toDraft(settings: AppSettings): DraftSettings {
  return {
    billingMode: settings.billingMode,
    hourlyRateYuan: String(settings.hourlyRateYuan),
    hourlyCommissionYuan: String(settings.hourlyCommissionYuan),
    miniAlwaysOnTop: settings.miniAlwaysOnTop,
    mainWindowBounds: settings.mainWindowBounds,
  };
}

function toSettings(draft: DraftSettings): AppSettings {
  return {
    billingMode: draft.billingMode,
    hourlyRateYuan: Number(draft.hourlyRateYuan),
    hourlyCommissionYuan: Number(draft.hourlyCommissionYuan),
    miniAlwaysOnTop: draft.miniAlwaysOnTop,
    ...(draft.mainWindowBounds ? { mainWindowBounds: draft.mainWindowBounds } : {}),
  };
}

function formatDataDirectory(): string {
  if (typeof process !== 'undefined' && process.env.ELECTRON_USER_DATA_DIR) {
    return process.env.ELECTRON_USER_DATA_DIR;
  }
  return '应用数据目录由 Electron userData 目录提供。';
}

export function SettingsPage({ api }: Props) {
  const [settings, setSettings] = useState<DraftSettings>(toDraft(DEFAULT_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [alwaysOnTopPending, setAlwaysOnTopPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [draftTouched, setDraftTouched] = useState(false);
  const draftTouchedRef = useRef(false);

  useEffect(() => {
    draftTouchedRef.current = draftTouched;
  }, [draftTouched]);

  useEffect(() => {
    let active = true;

    void api.settings.get().then((loaded) => {
      if (!active) return;
      if (!draftTouchedRef.current) {
        setSettings(toDraft(normalizeSettings(loaded)));
      }
      setHydrated(true);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      if (!draftTouchedRef.current) {
        setSettings(toDraft(DEFAULT_SETTINGS));
      }
      setHydrated(true);
      setLoading(false);
      setErrorMessage('无法读取默认参数，请稍后重试。');
    });

    return () => {
      active = false;
    };
  }, [api]);

  const canSave = useMemo(() => {
    const hourlyRateYuan = Number(settings.hourlyRateYuan);
    const hourlyCommissionYuan = Number(settings.hourlyCommissionYuan);
    return Number.isSafeInteger(hourlyRateYuan) && hourlyRateYuan > 0
      && Number.isSafeInteger(hourlyCommissionYuan) && hourlyCommissionYuan > 0;
  }, [settings.hourlyCommissionYuan, settings.hourlyRateYuan]);

  const updateSettings = (patch: Partial<DraftSettings>): void => {
    setDraftTouched(true);
    setSettings((current) => ({ ...current, ...patch }));
    setErrorMessage('');
    setStatusMessage('');
  };

  const save = async (): Promise<void> => {
    if (!canSave || saving) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const nextSettings = normalizeSettings(toSettings(settings));
      const saved = await api.settings.save(nextSettings);
      setSettings(toDraft(normalizeSettings(saved)));
      setDraftTouched(false);
      setStatusMessage('设置已保存');
    } catch {
      setErrorMessage('参数保存失败，当前设置保持不变。');
    } finally {
      setSaving(false);
    }
  };

  const handleAlwaysOnTopToggle = async (): Promise<void> => {
    if (alwaysOnTopPending) return;
    const previousValue = settings.miniAlwaysOnTop;
    const nextValue = !previousValue;
    setAlwaysOnTopPending(true);
    setErrorMessage('');
    setStatusMessage('');
    setDraftTouched(true);
    setSettings((current) => ({ ...current, miniAlwaysOnTop: nextValue }));

    try {
      const result = await api.window.setAlwaysOnTop(nextValue);
      const nextDraft: DraftSettings = { ...settings, miniAlwaysOnTop: result };
      setSettings(nextDraft);
      await api.settings.save(toSettings(nextDraft));
      setDraftTouched(false);
      setStatusMessage(result ? '迷你窗已置顶' : '迷你窗已取消置顶');
    } catch {
      setSettings((current) => ({ ...current, miniAlwaysOnTop: previousValue }));
      setErrorMessage('置顶状态保存失败，请稍后重试。');
    } finally {
      setAlwaysOnTopPending(false);
    }
  };

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="settings-header">
        <div>
          <span className="status-chip">设置</span>
          <h1 id="settings-title">设置</h1>
          <p>完全离线，所有数据只保存在本机。</p>
        </div>
      </header>

      <div className="settings-panel">
        <section className="settings-card">
          <h2>默认计费参数</h2>
          <p className="settings-copy">保存后只更新本地 app_settings，不会创建会话，也不会触发任何 session 写入。</p>

          <div className="settings-field">
            <label htmlFor="hourlyRateYuan">每小时单价</label>
            <input
              id="hourlyRateYuan"
              aria-label="每小时单价"
              type="text"
              inputMode="numeric"
              value={settings.hourlyRateYuan}
              onChange={(event) => updateSettings({ hourlyRateYuan: event.target.value })}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="hourlyCommissionYuan">每小时抽成</label>
            <input
              id="hourlyCommissionYuan"
              aria-label="每小时抽成"
              type="text"
              inputMode="numeric"
              value={settings.hourlyCommissionYuan}
              onChange={(event) => updateSettings({ hourlyCommissionYuan: event.target.value })}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="billingMode">计费方式</label>
            <select
              id="billingMode"
              aria-label="计费方式"
              value={settings.billingMode}
              onChange={(event) => updateSettings({ billingMode: event.target.value as BillingMode })}
            >
              {Object.entries(BILLING_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {!canSave && <p className="field-error" role="alert">请输入正整数单价和抽成。</p>}

          <div className="settings-actions">
            <button className="primary" onClick={() => void save()} disabled={!canSave || saving}>{saving ? '保存中…' : '保存设置'}</button>
          </div>
        </section>

        <section className="settings-card">
          <h2>迷你窗</h2>
          <p className="settings-copy">手动置顶状态会保存到本地设置，窗口再次打开时保持一致。</p>

          <label className="toggle-row">
            <span>
              <strong>迷你窗置顶</strong>
              <small>当前状态：{settings.miniAlwaysOnTop ? '已置顶' : '未置顶'}</small>
            </span>
            <input
              aria-label="迷你窗置顶"
              role="switch"
              type="checkbox"
              checked={settings.miniAlwaysOnTop}
              disabled={alwaysOnTopPending}
              onChange={() => void handleAlwaysOnTopToggle()}
            />
          </label>

          <p className="settings-copy">置顶开关调用 window.pwTool.window.setAlwaysOnTop(value)，并同步保存结果状态。</p>
        </section>

        <section className="settings-card settings-info">
          <h2>本机存储</h2>
          <p className="settings-copy">完全离线</p>
          <p className="settings-copy">不登录</p>
          <p className="settings-copy">不云同步</p>
          <p className="settings-copy">本地数据目录</p>
          <p className="settings-path" title={formatDataDirectory()}>{formatDataDirectory()}</p>
        </section>
      </div>

      {(statusMessage || errorMessage) && (
        <p className={errorMessage ? 'inline-error' : 'settings-success'} role={errorMessage ? 'alert' : 'status'}>
          {errorMessage || statusMessage}
        </p>
      )}

      {loading && !hydrated && <p className="settings-copy">正在读取设置…</p>}
    </section>
  );
}
