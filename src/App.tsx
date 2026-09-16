import { useMidnight } from './hooks/useMidnight';
import { Layout } from './components/Layout';
import { ReviewCard } from './components/ReviewCard';
import './styles.css';

export function App() {
  const midnight = useMidnight();

  return (
    <Layout wallet={midnight}>
      <div className="intro">
        <p>
          Prove you actually bought the product before you can review it, review only once, and stay anonymous
          doing it. Anyone can read every review — nobody can tell which buyer wrote which one.
        </p>
      </div>

      {midnight.status === 'connected' && midnight.connectedAPI ? (
        <ReviewCard connectedAPI={midnight.connectedAPI} />
      ) : (
        <p className="hint">
          Connect any Midnight-compatible wallet to deploy a review contract, record a purchase, or submit an
          anonymous review.
        </p>
      )}
    </Layout>
  );
}
