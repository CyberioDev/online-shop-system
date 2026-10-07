import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, type MatchCandidate, type ResolveCaseInput, type ReviewCase } from '@/api';
import { MessageSheet, NoOrderSheet } from '@/components/review/case-sheets';
import {
  CandidateOption,
  ChoiceRow,
  OrderCard,
  PaymentCard,
  SignalList,
} from '@/components/review/review-cards';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/theme';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/errors';
import { formatMoney, formatRelative } from '@/lib/format';
import { ablative, genitive, possessive } from '@/lib/mongolian';
import { differenceOf, reasonDescription, remainingMessage, verifyMessage } from '@/lib/review';

type Mode = 'confirm' | 'choose';
type UnderAction = 'request' | 'accept_short';
type SheetState =
  | { kind: 'message'; title: string; candidate: MatchCandidate; message: string }
  | { kind: 'no_order' }
  | null;

/**
 * State and UI for reviewing one open/waiting case. Returns the scrollable body,
 * the pinned action footer and any open sheet, so the route can place them in its Screen.
 * `onDone` runs after the case was resolved or the buyer was messaged.
 */
export function useCaseWorkspace(reviewCase: ReviewCase, onDone: () => void) {
  const colors = useColors();
  const styles = useStyles();
  const c = reviewCase;
  const suggestion = c.suggestion;
  const [mode, setMode] = useState<Mode>(suggestion ? 'confirm' : 'choose');
  const [rejectedId, setRejectedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    suggestion ? null : (c.candidates[0]?.order.id ?? null),
  );
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overAction, setOverAction] = useState<'refund' | 'keep'>('refund');
  const [underAction, setUnderAction] = useState<UnderAction>('request');
  const [note, setNote] = useState(c.note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!c.note);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useResource(
    () => (debouncedQuery ? api.searchCaseCandidates(c.id, debouncedQuery) : Promise.resolve([])),
    [c.id, debouncedQuery],
  );

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQuery(text.trim()), 300);
  };

  const nearby = [...(suggestion ? [suggestion] : []), ...c.candidates].filter(
    (x) => x.order.id !== rejectedId,
  );
  const searchResults = (search.data ?? []).filter(
    (x) => !nearby.some((n) => n.order.id === x.order.id),
  );
  const selected =
    mode === 'confirm'
      ? suggestion
      : ([...nearby, ...searchResults].find((x) => x.order.id === selectedId) ?? null);
  const diff = selected ? differenceOf(c, selected) : 0;
  const selectedPaid = selected?.order.status === 'paid';
  const requestsRemaining = diff < 0 && underAction === 'request';

  // ---------- Actions ----------

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSheet(null);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resolve = (input: ResolveCaseInput) => run(() => api.resolveCase(c.id, input));

  const confirmSelected = () => {
    if (!selected) return;
    if (requestsRemaining) {
      setSheet({
        kind: 'message',
        title: 'Үлдэгдэл нэхэх',
        candidate: selected,
        message: remainingMessage(c, selected),
      });
      return;
    }
    resolve({
      kind: 'matched',
      orderId: selected.order.id,
      differenceAction: diff > 0 ? overAction : diff < 0 ? 'accept_short' : null,
      note: note.trim() || null,
    });
  };

  const askBuyer = () => {
    if (!selected) return;
    setSheet({
      kind: 'message',
      title: 'Мессежээр асуух',
      candidate: selected,
      message: verifyMessage(c, selected),
    });
  };

  const chooseOther = (reject: boolean) => {
    if (reject && suggestion) setRejectedId(suggestion.order.id);
    setSelectedId(null);
    setMode('choose');
  };

  const backToSuggestion = () => {
    setRejectedId(null);
    setMode('confirm');
  };

  // ---------- Pieces ----------

  const title =
    mode === 'choose' || !suggestion
      ? 'Энэ төлбөр аль захиалгынх вэ?'
      : selectedPaid
        ? 'Энэ төлбөр давхар шилжүүлэг үү?'
        : `Энэ төлбөр ${genitive(suggestion.order.customerName)} захиалга мөн үү?`;

  const differencePanel =
    selected && diff !== 0 && !selectedPaid ? (
      <Card style={styles.gap}>
        <Text variant="label">
          Дүнгийн зөрүү: {formatMoney(Math.abs(diff))} {diff > 0 ? 'илүү' : 'дутуу'}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          Шилжүүлсэн {formatMoney(c.payment.amount)} · Захиалга {formatMoney(selected.order.total)}
        </Text>
        {diff > 0 ? (
          <>
            <ChoiceRow
              title={`Илүү ${formatMoney(diff)}-ийг буцаах`}
              description={`${c.payment.senderName} руу буцаан шилжүүлэх жагсаалтад нэмнэ.`}
              selected={overAction === 'refund'}
              onPress={() => setOverAction('refund')}
            />
            <ChoiceRow
              title="Илүүг үлдээх"
              description="Хүргэлтийн төлбөр, урамшуулал гэх мэт."
              selected={overAction === 'keep'}
              onPress={() => setOverAction('keep')}
            />
          </>
        ) : (
          <>
            <ChoiceRow
              title={`Үлдэгдэл ${formatMoney(-diff)}-ийг нэхэх`}
              description="Чатбот худалдан авагчид мессеж илгээнэ. Үлдэгдэл орох хүртэл хүлээнэ."
              selected={underAction === 'request'}
              onPress={() => setUnderAction('request')}
            />
            <ChoiceRow
              title="Дутууг зөвшөөрч баталгаажуулах"
              description="Хөнгөлөлт гэж үзээд захиалгыг төлөгдсөнд тооцно."
              selected={underAction === 'accept_short'}
              onPress={() => setUnderAction('accept_short')}
            />
          </>
        )}
      </Card>
    ) : null;

  const noteSection = noteOpen ? (
    <TextField
      label="Тэмдэглэл"
      placeholder="Жишээ: Утсаар ярьж баталгаажуулсан"
      value={note}
      onChangeText={setNote}
      multiline
      style={styles.note}
    />
  ) : (
    <LinkButton icon="edit-3" label="Тэмдэглэл нэмэх" onPress={() => setNoteOpen(true)} />
  );

  const body: ReactNode = (
    <View style={styles.body}>
      <View style={styles.intro}>
        <Text variant="display" style={styles.title}>
          {title}
        </Text>
        <Text color={colors.textSecondary}>{reasonDescription(c)}</Text>
      </View>

      {c.contact && (
        <Card tone="info" style={styles.gap}>
          <View style={styles.inline}>
            <Icon name="message-circle" size={16} color={colors.primary} />
            <Text variant="captionMedium" color={colors.primary}>
              Мессеж илгээсэн: {c.contact.customerName} · {formatRelative(c.contact.sentAt)}
            </Text>
          </View>
          <Text variant="caption" color={colors.primary}>
            “{c.contact.message}”
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Хариу ирсэн бол доороос шийдвэрлэнэ үү.
          </Text>
        </Card>
      )}

      <PaymentCard payment={c.payment} />

      {mode === 'confirm' && suggestion ? (
        <>
          <OrderCard order={suggestion.order} />
          <Card>
            <SignalList signals={suggestion.signals} />
          </Card>
          {differencePanel}
          <LinkButton icon="list" label="Бусад захиалгуудыг харах" onPress={() => chooseOther(false)} />
        </>
      ) : (
        <>
          <View style={styles.gap}>
            <Text variant="label">Ойролцоо захиалгууд</Text>
            {nearby.length === 0 ? (
              <Text variant="caption" color={colors.textSecondary}>
                Ойролцоо захиалга олдсонгүй. Доороос нэр, код эсвэл дүнгээр хайна уу.
              </Text>
            ) : (
              nearby.map((candidate) => (
                <CandidateOption
                  key={candidate.order.id}
                  candidate={candidate}
                  selected={selectedId === candidate.order.id}
                  onSelect={() => setSelectedId(candidate.order.id)}
                />
              ))
            )}
          </View>

          <View style={styles.gap}>
            <TextField
              placeholder="Нэр, захиалгын код эсвэл дүнгээр хайх"
              value={query}
              onChangeText={onQueryChange}
              autoCorrect={false}
              prefix={
                <View style={styles.searchIcon}>
                  <Icon name="search" size={18} color={colors.textMuted} />
                </View>
              }
            />
            {debouncedQuery !== '' &&
              (search.loading ? (
                <Text variant="caption" color={colors.textSecondary}>
                  Хайж байна…
                </Text>
              ) : searchResults.length === 0 ? (
                <Text variant="caption" color={colors.textSecondary}>
                  «{debouncedQuery}» илэрц олдсонгүй.
                </Text>
              ) : (
                searchResults.map((candidate) => (
                  <CandidateOption
                    key={candidate.order.id}
                    candidate={candidate}
                    selected={selectedId === candidate.order.id}
                    onSelect={() => setSelectedId(candidate.order.id)}
                  />
                ))
              ))}
          </View>

          {differencePanel}
          {suggestion && (
            <LinkButton
              icon="corner-up-left"
              label={`Санал болгосон захиалга руу буцах (${suggestion.order.customerName})`}
              onPress={backToSuggestion}
            />
          )}
        </>
      )}

      {noteSection}
    </View>
  );

  // ---------- Footer ----------

  const footerNote = (text: string) => (
    <Text variant="caption" color={colors.textSecondary} style={styles.center}>
      {text}
    </Text>
  );

  let footer: ReactNode;
  if (mode === 'confirm' && suggestion && selectedPaid) {
    footer = (
      <>
        <Button
          title="Тийм, буцаан олгох"
          loading={busy}
          onPress={() => resolve({ kind: 'no_order', category: 'refund', note: note.trim() || null })}
        />
        <View style={styles.row}>
          <Button title="Мессежээр асуух" variant="outline" size="md" onPress={askBuyer} style={styles.flex} />
          <Button title="Өөр захиалга" variant="outline" size="md" onPress={() => chooseOther(true)} style={styles.flex} />
        </View>
        {footerNote('Буцаалт хийх жагсаалтад нэмэгдэнэ.')}
      </>
    );
  } else if (mode === 'confirm' && suggestion) {
    footer = (
      <>
        <Button
          title={requestsRemaining ? 'Үлдэгдэл нэхэх' : 'Тийм, баталгаажуулах'}
          loading={busy}
          onPress={confirmSelected}
        />
        <View style={styles.row}>
          <Button title="Үгүй" variant="outline" size="md" onPress={() => chooseOther(true)} style={styles.flex} />
          <Button title="Мессежээр асуух" variant="outline" size="md" onPress={askBuyer} style={styles.flex} />
        </View>
        {footerNote(
          requestsRemaining
            ? 'Үлдэгдэл орсны дараа баталгаажуулна.'
            : 'Баталгаажмагц худалдан авагчид автоматаар мэдэгдэнэ.',
        )}
      </>
    );
  } else {
    const name = selected?.order.customerName;
    footer = (
      <>
        <Button
          title={
            !selected
              ? 'Захиалга сонгоно уу'
              : selectedPaid
                ? 'Энэ захиалга төлөгдсөн байна'
                : requestsRemaining
                  ? 'Үлдэгдэл нэхэх'
                  : `${possessive(name!)} гэж баталгаажуулах`
          }
          disabled={!selected || selectedPaid}
          loading={busy}
          onPress={confirmSelected}
        />
        <Button
          title={selected ? `${ablative(name!)} мессежээр асуух` : 'Мессежээр асуух'}
          variant="outline"
          size="md"
          disabled={!selected}
          onPress={askBuyer}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setSheet({ kind: 'no_order' })}
          style={styles.footerLink}>
          <Text variant="captionMedium" color={colors.primary} style={styles.underline}>
            Захиалгагүй төлбөр гэж тэмдэглэх
          </Text>
        </Pressable>
      </>
    );
  }

  const footerView = (
    <View style={styles.footer}>
      {error && !sheet && (
        <View style={styles.error}>
          <Icon name="alert-circle" size={16} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={styles.flex}>
            {error}
          </Text>
        </View>
      )}
      {footer}
    </View>
  );

  const sheets =
    sheet?.kind === 'message' ? (
      <MessageSheet
        title={sheet.title}
        candidate={sheet.candidate}
        initialMessage={sheet.message}
        busy={busy}
        error={error}
        onClose={() => setSheet(null)}
        onSend={(message) => run(() => api.contactBuyer(c.id, sheet.candidate.order.id, message))}
      />
    ) : sheet?.kind === 'no_order' ? (
      <NoOrderSheet
        reviewCase={c}
        initialNote={note}
        busy={busy}
        error={error}
        onClose={() => setSheet(null)}
        onSubmit={(category, sheetNote) =>
          resolve({ kind: 'no_order', category, note: sheetNote.trim() || null })
        }
      />
    ) : null;

  return { body, footer: footerView, sheets };
}

function LinkButton({
  icon,
  label,
  onPress,
}: {
  icon: 'edit-3' | 'list' | 'corner-up-left';
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link} hitSlop={6}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text variant="captionMedium" color={colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    gap: Spacing.five,
  },
  intro: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  gap: {
    gap: Spacing.three,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchIcon: {
    paddingLeft: Spacing.four,
  },
  note: {
    minHeight: 80,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  footer: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  footerLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: colors.dangerSoft,
  },
}));
