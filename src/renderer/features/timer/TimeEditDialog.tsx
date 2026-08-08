import type { Session, TimeSegment } from '../../../shared/domain/types';
import { TimeSegmentEditor } from '../history/TimeSegmentEditor';
import '../history/history.css';

interface Props {
  session: Session;
  onClose(): void;
  onSave(segments: TimeSegment[]): Promise<void>;
}

export function TimeEditDialog({ session, onClose, onSave }: Props) {
  return (
    <TimeSegmentEditor
      session={session}
      nowMs={Date.now()}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
