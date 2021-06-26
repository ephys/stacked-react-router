import type { History as RouterHistory, Location, LocationDescriptor, Path } from 'history';
import { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { MaybePromise } from '../utils/types';
import { useLocationLocker, LockLocation } from './location-locker';

export interface AdvancedHistory<State = unknown> {
  history: RouterHistory<State>;

  /**
   * Navigate will block location updates until the promise returned by {cb} resolves
   * Using this, you can move freely through the history without causing rendering flicker
   *
   * NB. Each navigation action has a delay, use sparingly.
   */
  navigate<T>(cb: () => Promise<T> | T): Promise<T>;

  /**
   * Like {@link RouterHistory.goBack} but returns a promise that resolves once successfully navigated
   *
   * @param {boolean} preventLeavingApp - Cancel operation if there is no previous entry in the history specific to this SPA instance.
   *
   * @returns A promise that resolves to true if the application went back, or false if {preventLeavingApp} is true and there is no previous entry.
   */
  goBackAsync(preventLeavingApp?: boolean): Promise<boolean>;

  /** Like {@link RouterHistory.goForward} but returns a promise that resolves once successfully navigated */
  goForwardAsync(): Promise<boolean>;

  /** Like {@link RouterHistory.go} but returns a promise that resolves once successfully navigated */
  goAsync(n: number): Promise<void>;

  /** Like {@link RouterHistory.push} but returns a promise that resolves once successfully navigated */
  pushAsync(location: LocationDescriptor<State>): Promise<void>;
  pushAsync(path: Path, state?: State): Promise<void>;

  /** Like {@link RouterHistory.replace} but returns a promise that resolves once successfully navigated */
  replaceAsync(path: LocationDescriptor<State>, state?: any): Promise<void>;

  /**
   * This method will roll back the history until the desired destination is reached.
   * If no history entry matches the destination, the oldest history entry will be replaced by {fallback}
   *
   * Location matching is done through {@link locationPartialMatches}
   *
   * @param location
   * @param fallback
   *
   * @deprecated use {@see AdvancedHistory#goBackToKey}
   */
  goBackUntil(
    location: (Partial<Location<State>> | TLocationCb<State>),
    fallback?: Partial<Location<State>>
  ): Promise<void>;

  /**
   * Goes backwards in the history to the history entry for which {locationMatcher} returns true.
   *
   * If {locationMatcher} does not return true for any history entry and {fallback} is defined, it pushes {fallback} as a new route.
   * If not defined, the history position remains unchanged.
   *
   * @param {TLocationCb<State>} locationMatcher
   * @param {Location<State>} fallback - The new location that will be pushed if {key} is not found.
   * @returns {Promise<boolean>} A promise that resolves once navigation is complete. It resolves to true if the app navigated, and false otherwise.
   */
  goBackToMatch(locationMatcher: TLocationCb<State>, fallback?: LocationDescriptor<State>): Promise<boolean>;

  /**
   * Goes backwards in the history to the entry matching {key} (if it exists in the history).
   *
   * If the entry does not exist in history and {fallback} is defined, it pushes {fallback} as a new route.
   * If not defined, the history position remains unchanged.
   *
   * @param {string} key - The ID of the history entry to return to.
   * @param {Location<State>} fallback - The new location that will be pushed if {key} is not found.
   * @returns {Promise<boolean>} A promise that resolves to true if the app navigated to the key, and false otherwise.
   */
  goBackToKey(key: string, fallback?: LocationDescriptor<State>): Promise<boolean>;
}

type TLocationCb<State> = (loc: Location<State>) => boolean;

export function useAdvancedHistory<State>(): AdvancedHistory<State> {
  const history: RouterHistory<State> = useHistory<State>();
  const lock = useLocationLocker();

  return useMemo(() => {
    const advHistory: AdvancedHistory<State> = {
      history,
      navigate: callback => navigate(callback, lock),
      goBackAsync: (preventLeavingApp?: boolean) => goBackAsync(history, preventLeavingApp),
      goForwardAsync: () => goForwardAsync(history),
      goAsync: promisify(history, 'go'),
      pushAsync: (path: Path | LocationDescriptor<State>, state?: State) => pushAsync(history, path, state),
      replaceAsync: promisify(history, 'replace'),
      goBackUntil: (
        location: Partial<Location<State>> | TLocationCb<State>,
        fallback?: Partial<Location<State>>,
      ) => {
        return goBackUntil(history, lock, location, fallback);
      },
      goBackToMatch: (locationMatcher: TLocationCb<State>, fallback?: LocationDescriptor<State>) => {
        return goBackToMatch(history, lock, locationMatcher, fallback);
      },
      goBackToKey: (key: string, fallback?: LocationDescriptor<State>) => {
        return goBackToKey(history, lock, key, fallback);
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

function pushAsync<State>(
  history: RouterHistory<State>,
  path: LocationDescriptor<State>,
  state?: State,
): Promise<void> {
  // @ts-expect-error
  return waitForHistory(history, () => history.push(path, state));
}

function goForwardAsync<State>(history: RouterHistory<State>): Promise<boolean> {
  // we don't currently have a way to determine if we're on the history entry of the SPA
  // so for now we can't cancel it
  return waitForHistory(history, () => history.goForward()).then(() => true);
}

function goBackAsync<State>(history: RouterHistory<State>, preventLeavingApp: boolean = false): Promise<boolean> {
  if (preventLeavingApp) {
    const previousLocation = history.location.state?.previousLoc;

    if (!previousLocation) {
      return Promise.resolve(false);
    }
  }

  return waitForHistory(history, () => history.goBack()).then(() => true);
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

async function navigate<T>(callback: () => MaybePromise<T>, lock): Promise<T> {
  const unlock = lock();
  const returnVal = await callback();
  unlock();

  return returnVal;
}

function goBackToMatch<State>(history: RouterHistory<State>, lock: LockLocation,
  matcher: TLocationCb<State>, fallback?: LocationDescriptor<State>): Promise<boolean> {
  return navigate(async () => {
    const startingKey = history.location.key;

    const success = await goBackToMatchImpl<State>(history, matcher);
    if (success) {
      return true;
    }

    await goForwardToKeyImpl(history, startingKey);

    if (fallback) {
      await pushAsync(history, fallback);
    }

    return false;
  }, lock);
}

async function goBackToMatchImpl<State>(history: RouterHistory<State>, matcher: TLocationCb<State>): Promise<boolean> {
  while (!matcher(history.location)) {
    // eslint-disable-next-line no-await-in-loop
    const success = await goBackAsync(history, true);
    if (!success) {
      return false;
    }
  }

  return true;
}

function goBackToKey<State>(history: RouterHistory<State>, lock: LockLocation,
  key: string, fallback?: LocationDescriptor<State>): Promise<boolean> {

  return navigate(async () => {
    const startingKey = history.location.key;

    const success = await goBackToKeyImpl<State>(history, key);
    if (success) {
      return true;
    }

    await goForwardToKeyImpl(history, startingKey);

    if (fallback) {
      await pushAsync(history, fallback);
    }

    return false;
  }, lock);
}

async function goBackToKeyImpl<State>(history: RouterHistory<State>, key: string): Promise<boolean> {
  while (history.location.key !== key) {
    // eslint-disable-next-line no-await-in-loop
    const success = await goBackAsync(history, true);
    if (!success) {
      return false;
    }
  }

  return true;
}

async function goForwardToKeyImpl<State>(history: RouterHistory<State>, key: string): Promise<boolean> {
  while (history.location.key !== key) {
    // eslint-disable-next-line no-await-in-loop
    const success = await goForwardAsync(history);
    if (!success) {
      return false;
    }
  }

  return true;
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

  const success = await goBackAsync(history);
  if (!success) {
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
