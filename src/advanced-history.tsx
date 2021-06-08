import type { History as RouterHistory, Location, LocationDescriptor } from 'history';
import { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useLocationLocker, LockLocation } from './location-locker';

export type AdvancedHistory<State = unknown> = {
  history: RouterHistory<State>,

  /**
   * Navigate will block location updates until the promise returned by {cb} resolves
   * Using this, you can move freely through the history without causing rendering flicker
   *
   * NB. Each navigation action has a delay, use sparingly.
   */
  navigate: (cb: () => Promise<void> | void) => Promise<void>,

  /** Like {@link RouterHistory.goBack} but returns a promise that resolves once successfully navigated */
  goBackAsync: () => Promise<void>,

  /** Like {@link RouterHistory.goForward} but returns a promise that resolves once successfully navigated */
  goForwardAsync: () => Promise<void>,

  /** Like {@link RouterHistory.go} but returns a promise that resolves once successfully navigated */
  goAsync: (n: number) => Promise<void>,

  /** Like {@link RouterHistory.push} but returns a promise that resolves once successfully navigated */
  pushAsync: (path: string | LocationDescriptor, state?: any) => Promise<void>,

  /** Like {@link RouterHistory.replace} but returns a promise that resolves once successfully navigated */
  replaceAsync: (path: string | LocationDescriptor, state?: any) => Promise<void>,

  /**
   * This method will roll back the history until the desired destination is reached.
   * If no history entry matches the destination, the oldest history entry will be replaced by {fallback}
   *
   * Location matching is done through {@link locationPartialMatches}
   *
   * @param location
   * @param fallback
   */
  goBackUntil: (
    location: (Partial<Location<State>> | TLocationCb<State>),
    fallback?: Partial<Location<State>>
  ) => Promise<void>,
};

type TLocationCb<State> = (loc: Location<State>) => boolean;

export function useAdvancedHistory<State>(): AdvancedHistory<State> {
  const history: RouterHistory<State> = useHistory<State>();
  const lock = useLocationLocker();

  return useMemo(() => {
    const advHistory: AdvancedHistory<State> = {
      history,
      navigate: callback => navigate(callback, lock),
      goBackAsync: () => goBackAsync(history),
      goForwardAsync: promisify(history, 'goForward'),
      goAsync: promisify(history, 'go'),
      pushAsync: promisify(history, 'push'),
      replaceAsync: promisify(history, 'replace'),
      goBackUntil: (
        location: Partial<Location<State>> | TLocationCb<State>,
        fallback?: Partial<Location<State>>,
      ) => {
        return goBackUntil(history, lock, location, fallback);
      },
    };

    return advHistory;
  }, [history, lock]);
}

function promisify(history: RouterHistory, methodName: string) {
  const method = (...args) => {
    return waitForHistory(history, () => history[methodName](...args));
  };

  return method;
}

function goBackAsync(history: RouterHistory) {
  return waitForHistory(history, () => history.goBack());
}

function waitForHistory(history: RouterHistory, callback: () => void) {
  return new Promise<void>(resolve => {
    const detach = history.listen(() => {
      detach();
      resolve();
    });

    callback();
  });
}

async function navigate(callback, lock) {
  const unlock = lock();
  await callback();
  unlock();
}

/**
 * This method will roll back the history until the desired destination is reached.
 * If no history entry matches the destination, the oldest history entry will be replaced by {fallback}
 *
 * Location matching is done through {@link locationPartialMatches}
 *
 * @param history
 * @param lock
 * @param location
 * @param fallback
 */
async function goBackUntil<State>(
  history: RouterHistory<State>,
  lock: LockLocation,
  location: Partial<Location<State>> | TLocationCb<State>,
  fallback?: Partial<Location<State>>,
): Promise<void> {
  return navigate(() => goBackUntilImpl<State>(history, location, fallback), lock);
}

async function goBackUntilImpl<State>(
  history: RouterHistory<State>,
  location: Partial<Location<State>> | TLocationCb<State>,
  fallback: Partial<Location<State>>,
) {
  if (typeof location === 'function') {
    if (location(history.location)) {
      return;
    }
  } else if (locationPartialMatches(history.location, location)) {
    return;
  }

  const previousLocation = history.location.state?.previousLoc;

  if (!previousLocation) {
    if (!fallback) {
      if (typeof location !== 'function') {
        fallback = location;
      } else {
        fallback = { pathname: '/' };
      }
    }

    history.replace(fallback);

    return;
  }

  await goBackAsync(history);
  await goBackUntilImpl(history, location, fallback);
}

/**
 *
 * @param location
 * @param partial
 * @returns {boolean}
 */
export function locationPartialMatches(location: Location, partial: Partial<Location>): boolean {

  /*
   location shape:
   key?: string, # ignored
   pathname: string, # must match

   search: string, # TODO: need to parse content and handle partially like state
   state?: any, # is handled partially

   hash: string, # never used
   */

  // most specific
  if (partial.key && location.key !== partial.key) {
    return false;
  }

  if (partial.pathname != null && partial.pathname !== location.pathname) {
    return false;
  }

  if (partial.state) {
    const keys = Object.keys(partial.state);
    const locState = location.state || {};

    for (const key of keys) {
      if (locState[key] !== partial.state[key]) {
        return false;
      }
    }
  }

  // TODO partial.search
  // TODO hash

  return true;
}
