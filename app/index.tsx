import { Redirect } from 'expo-router';

/** Entry point. Phase 1 will send signed-out users to (auth) instead. */
export default function Index() {
  return <Redirect href="/today" />;
}
