interface Props {
  query: string;
  status: 'all' | 'completed' | 'invalid';
  from: string;
  to: string;
  onQueryChange(value: string): void;
  onStatusChange(value: 'all' | 'completed' | 'invalid'): void;
  onFromChange(value: string): void;
  onToChange(value: string): void;
}

export function HistoryFilters(props: Props) {
  return (
    <section className="history-filters" aria-label="历史筛选">
      <label>
        搜索备注
        <input
          type="search"
          role="searchbox"
          aria-label="搜索备注"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="按备注、订单号或编号搜索"
        />
      </label>
      <label>
        状态筛选
        <select aria-label="状态筛选" value={props.status} onChange={(event) => props.onStatusChange(event.target.value as Props['status'])}>
          <option value="all">全部</option>
          <option value="completed">有效</option>
          <option value="invalid">无效</option>
        </select>
      </label>
      <label>
        开始日期
        <input aria-label="开始日期" type="date" value={props.from} onChange={(event) => props.onFromChange(event.target.value)} />
      </label>
      <label>
        结束日期
        <input aria-label="结束日期" type="date" value={props.to} onChange={(event) => props.onToChange(event.target.value)} />
      </label>
    </section>
  );
}
