export const loadProfilePage = () => import('@/pages/Profile');

let profilePreloadPromise: Promise<unknown> | null = null;

export const preloadProfilePage = () => {
  if (!profilePreloadPromise) {
    profilePreloadPromise = loadProfilePage().catch((error) => {
      profilePreloadPromise = null;
      throw error;
    });
  }
  return profilePreloadPromise;
};
