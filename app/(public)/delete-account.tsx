import Head from 'expo-router/head';
import { Platform } from 'react-native';

import { PublicDeleteAccountPage } from '@/features/account';

/**
 * `/delete-account` — public, static explanation of how a person deletes their account (store data-deletion
 * requirement). Indexable on purpose: the store reviewer and the person must be able to find it. The slug is
 * reserved, so no business can take this address.
 */
export default function DeleteAccountRoute() {
  return (
    <>
      {Platform.OS === 'web' ? (
        <Head>
          <title>Delete your account</title>
          <meta
            name="description"
            content="How to delete your account and what happens to your data."
          />
        </Head>
      ) : null}
      <PublicDeleteAccountPage />
    </>
  );
}
