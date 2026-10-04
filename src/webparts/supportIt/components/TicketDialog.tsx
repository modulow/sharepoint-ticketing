import * as React from 'react';
import { getId, Modal } from '@fluentui/react';
import styles from './SupportIt.module.scss';

interface ITicketDialogProps {
  title: string;
  onDismiss: () => void;
  children: React.ReactNode;
  dismissDisabled?: boolean;
}

const TicketDialog: React.FC<ITicketDialogProps> = ({ title, onDismiss, children, dismissDisabled = false }) => {
  const [titleId] = React.useState(() => getId('ticket-dialog-title'));

  return (
    <Modal
      isOpen
      titleAriaId={titleId}
      onDismiss={onDismiss}
      isBlocking={dismissDisabled}
      isAlert={false}
      focusTrapZoneProps={{ isClickableOutsideFocusTrap: false, forceFocusInsideTrap: true }}
      containerClassName={styles.ticketDialog}
      scrollableContentClassName={styles.dialogContent}
    >
      <div className={styles.dialogHeader}>
        <h2 id={titleId}>{title}</h2>
        <button className={styles.secondaryButton} type="button" disabled={dismissDisabled} onClick={onDismiss} aria-label="Close ticket window">
          Close
        </button>
      </div>
      <div className={styles.dialogBody}>{children}</div>
    </Modal>
  );
};

export default TicketDialog;
