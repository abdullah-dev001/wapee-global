import { RouteGuard } from '@/features/auth';
import { ReviewsScreen } from '@/features/reviews/components/ReviewsScreen';

export default function ReviewsRoute() {
  return (
    <RouteGuard>
      <ReviewsScreen />
    </RouteGuard>
  );
}
