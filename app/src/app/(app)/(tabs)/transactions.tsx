import { useState } from 'react';
import { View } from 'react-native';
import { api, type ListQuery } from '@/api';
import { DateTimeFilter, Pagination } from '@/components/list-controls';
import { Card } from '@/components/ui/card';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { useReloadOnFocus } from '@/hooks/use-resource';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Spacing } from '@/constants/theme';

export default function TransactionsScreen() {
  const [range, setRange] = useState<ListQuery>({});
  const [query, setQuery] = useState('');
  const filters = { ...range, q: query.trim() || undefined, limit: 25 };
  const paging = usePagedResource(cursor => api.getTransactionsPage({ ...filters, cursor }), JSON.stringify(filters));
  const { data, error, reload } = paging;
  useReloadOnFocus(reload);
  return <Screen>
    <Text variant="display">Гүйлгээ</Text>
    <Text>Банкны орлогын гүйлгээнүүд</Text>
    <DateTimeFilter onRefresh={reload} onChange={setRange} />
    <TextField placeholder="Гүйлгээний утга эсвэл илгээгч хайх" value={query} onChangeText={setQuery} autoCorrect={false} />
    {!data ? <LoadState error={error} onRetry={reload} /> : <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
      {data.transactions.length === 0 && <Text>Энэ хугацаанд гүйлгээ алга. “Нийт” эсвэл өөр хугацаа сонгоно уу.</Text>}
      {data.transactions.map(payment => <Card key={payment.id}>
        <Text variant="heading">{formatMoney(payment.amount)}</Text>
        <Text>{formatDateTime(new Date(payment.receivedAt))} · {payment.bank}</Text>
        {!!payment.senderName && <Text>{payment.senderName}</Text>}
        <Text>{payment.note || 'Гүйлгээний утга байхгүй'}</Text>
        <Text variant="caption">{payment.rawMessage}</Text>
      </Card>)}
      <Pagination {...paging} total={data.total} count={data.transactions.length} hasNext={!!data.nextCursor} />
    </View>}
  </Screen>;
}
