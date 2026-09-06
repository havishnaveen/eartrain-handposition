import * as Dialog from '@radix-ui/react-dialog';

/** A viewport-level, focus-trapped notice that requires an explicit acknowledgement. */
export default function AcknowledgeDialog({ title, message, buttonLabel = 'I understand', onAcknowledge }: {
  title: string;
  message: string;
  buttonLabel?: string;
  onAcknowledge?: () => void;
}) {
  return <Dialog.Root open>
    <Dialog.Portal>
      <Dialog.Overlay className="et-orientation-gate" />
      <Dialog.Content className="et-orientation-tip" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{message}</Dialog.Description>
        <button type="button" onClick={onAcknowledge}>{buttonLabel}</button>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
