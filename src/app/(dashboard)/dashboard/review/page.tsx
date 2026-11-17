import { unstable_rethrow } from "next/navigation";
import { getReviewQueue } from "@/backend/articles/review-queue/review-queue";
import { ReviewQueue } from "@/frontend/features/articles/components/review-queue/review-queue";

export default async function ReviewPage() {
  let items;
  try {
    items = await getReviewQueue();
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Review queue</h1>
        <p role="alert">
          Unable to load the review queue. Reload to try again.
        </p>
      </>
    );
  }
  return (
    <>
      <h1>Review queue</h1>
      <ReviewQueue items={items} />
    </>
  );
}
