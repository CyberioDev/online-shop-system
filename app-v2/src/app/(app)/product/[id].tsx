import { useLocalSearchParams } from 'expo-router';

import { api } from '@/api';
import { ProductForm } from '@/components/product-form';
import { LoadState } from '@/components/ui/load-state';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { FormMaxWidth } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: product, error, reload } = useResource(() => api.getProduct(id), [id]);

  if (!product) {
    return (
      <Screen
        maxWidth={FormMaxWidth}
        header={<ScreenHeader title="Бараа засах" fallbackHref="/products" />}>
        <LoadState error={error} onRetry={reload} />
      </Screen>
    );
  }

  // Keyed so the form state resets if the route switches to another product.
  return <ProductForm key={product.id} product={product} />;
}
