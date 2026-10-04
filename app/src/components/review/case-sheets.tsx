import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MatchCandidate, ReviewCase } from '@/api';
import { ChoiceRow } from '@/components/review/review-cards';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/labels';

/** Edit and send a chatbot message to the buyer of `candidate`. */
export function MessageSheet({
  title,
  candidate,
  initialMessage,
  busy,
  error,
  onSend,
  onClose,
}: {
  title: string;
  candidate: MatchCandidate;
  initialMessage: string;
  busy: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const { order } = candidate;

  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <Button
          title="Илгээх"
          icon="send"
          onPress={() => onSend(message)}
          loading={busy}
          disabled={!message.trim()}
        />
      }>
      <Text color={Colors.textSecondary}>
        Хэнд:{' '}
        <Text variant="bodyMedium">
          {order.customerName} · {CHANNEL_LABELS[order.channel]} · {order.code}
        </Text>
      </Text>
      <TextField
        label="Мессеж"
        value={message}
        onChangeText={setMessage}
        multiline
        style={styles.message}
        hint="Чатбот энэ мессежийг худалдан авагчид илгээнэ. Хариу ирэхэд “Хариу хүлээж буй” хэсэгт харагдана."
        error={error}
      />
    </Sheet>
  );
}

/** Mark a payment as not belonging to any order. */
export function NoOrderSheet({
  reviewCase,
  initialNote,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  reviewCase: ReviewCase;
  initialNote: string;
  busy: boolean;
  error: string | null;
  onSubmit: (category: 'refund' | 'other_income', note: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<'refund' | 'other_income'>('refund');
  const [note, setNote] = useState(initialNote);
  const { payment } = reviewCase;

  return (
    <Sheet
      visible
      title="Захиалгагүй төлбөр"
      onClose={onClose}
      footer={
        <Button title="Тэмдэглэх" onPress={() => onSubmit(category, note)} loading={busy} />
      }>
      <Text color={Colors.textSecondary}>
        {formatMoney(payment.amount)} · {payment.senderName}. Энэ төлбөрийг юу гэж бүртгэх вэ?
      </Text>
      <View style={styles.choices}>
        <ChoiceRow
          title="Буцаан олгох"
          description={`${formatMoney(payment.amount)}-ийг ${payment.senderName} руу буцаана. “Буцаалт хийх” жагсаалтад нэмэгдэнэ.`}
          selected={category === 'refund'}
          onPress={() => setCategory('refund')}
        />
        <ChoiceRow
          title="Бусад орлого"
          description="Захиалгатай холбоогүй орлого (зээл, хувийн шилжүүлэг г.м). Борлуулалтад тооцогдохгүй."
          selected={category === 'other_income'}
          onPress={() => setCategory('other_income')}
        />
      </View>
      <TextField
        label="Тэмдэглэл (заавал биш)"
        placeholder="Жишээ: Андуурч шилжүүлсэн"
        value={note}
        onChangeText={setNote}
        multiline
        style={styles.note}
        error={error}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: {
    minHeight: 140,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 22,
  },
  note: {
    minHeight: 80,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  choices: {
    gap: Spacing.three,
  },
});
