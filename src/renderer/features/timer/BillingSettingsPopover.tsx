import { useEffect, useState } from 'react';
import type { PwToolApi } from '../../../preload/api';
import type { AppSettings, BillingMode, BillingSettings } from '../../../shared/domain/types';
import { billingModeLabels } from './TimerPage';

interface Props {
  api: PwToolApi;
  settings?: BillingSettings;
  idle?: boolean;
  onClose(): void;
}

const fallbackSettings: AppSettings = {
  billingMode: '15-step', hourlyRateYuan: 40, hourlyCommissionYuan: 3, miniAlwaysOnTop: false,
};

export function BillingSettingsPopover({ api, settings, idle = false, onClose }: Props) {
  const [current, setCurrent] = useState<AppSettings>({ ...fallbackSettings, ...settings });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const baseline = settings ?? fallbackSettings;
  const dirty = current.billingMode !== baseline.billingMode
    || current.hourlyRateYuan !== baseline.hourlyRateYuan
    || current.hourlyCommissionYuan !== baseline.hourlyCommissionYuan;

  useEffect(() => {
    if (!idle) return;
    let active = true;
    void api.settings.get().then((value) => active && setCurrent(value)).catch(() => active && setError('无法读取默认参数。'));
    return () => { active = false; };
  }, [api, idle]);

  const rateValid = Number.isSafeInteger(current.hourlyRateYuan) && current.hourlyRateYuan > 0;
  const commissionValid = Number.isSafeInteger(current.hourlyCommissionYuan) && current.hourlyCommissionYuan > 0;
  const valid = rateValid && commissionValid;

  const save = async (): Promise<void> => {
    if (!valid || pending) return;
    setPending(true);
    setError('');
    try {
      if (idle) await api.settings.save(current);
      else await api.session.updateSettings(current);
      onClose();
    } catch {
      setError('参数保存失败，当前有效结果保持不变。');
    } finally {
      setPending(false);
    }
  };

  const close = (): void => {
    if (!dirty || window.confirm('参数尚未保存，确定关闭吗？')) onClose();
  };

  return (
    <div className="popover" role="dialog" aria-modal="true" aria-labelledby="billing-title" onKeyDown={(event) => {
       if (event.key === 'Escape' && !pending) close();
      if (event.key === 'Enter') void save();
    }}>
       <div className="dialog-heading"><div><h2 id="billing-title">计费设置</h2><p>{idle ? '保存为下一局默认参数' : '只影响当前一局'}</p></div><button className="icon-button" onClick={close} aria-label="关闭计费设置">×</button></div>
      <label>每小时单价<input autoFocus aria-label="每小时单价" type="number" min="1" step="1" value={current.hourlyRateYuan} onChange={(event) => setCurrent({ ...current, hourlyRateYuan: Number(event.target.value) })} /></label>
      {!rateValid && <span className="field-error">请输入正整数单价</span>}
      <label>每小时抽成<input aria-label="每小时抽成" type="number" min="1" step="1" value={current.hourlyCommissionYuan} onChange={(event) => setCurrent({ ...current, hourlyCommissionYuan: Number(event.target.value) })} /></label>
      {!commissionValid && <span className="field-error">请输入正整数抽成</span>}
      <label>计费方式<select aria-label="计费方式" value={current.billingMode} onChange={(event) => setCurrent({ ...current, billingMode: event.target.value as BillingMode })}>{Object.entries(billingModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
       <div className="dialog-actions"><button className="secondary" onClick={close} disabled={pending}>取消</button><button className="primary" onClick={() => void save()} disabled={!valid || pending}>{pending ? '保存中…' : '保存参数'}</button></div>
    </div>
  );
}
