import * as React from 'react';
import { useHistory, useLocation, Route } from 'react-router-dom';
import { createTrappedCallable } from '../utils/dev-utils';

type Props = {
  children: React.ReactNode,
};

export type LockLocation = () => (() => void);

export const LocationLockerContext = React.createContext<LockLocation>(createTrappedCallable());

/**
 * The purpose of this component is to provide a hook ({@link useLocationLocker})
 * that will prevent any re-rendering caused by location changes for descendants of this component.
 *
 * Rendering will resume as soon as it is unlocked
 *
 * @param props
 * @returns {*}
 * @constructor
 */
export function LocationLocker(props: Props) {
  const history = useHistory();
  const location = useLocation();
  const [locationOverride, setOverride] = React.useState(null);
  const lockCount = React.useRef(0);

  const lock = React.useCallback(() => {
    if (++lockCount.current === 1) {
      setOverride(oldLoc => {
        if (oldLoc) {
          throw new Error('Location is already locked. Please unlock first');
        }

        return history.location;
      });
    }

    let dead = false;

    return function unlock() {
      if (dead) {
        return;
      }

      dead = true;

      if (--lockCount.current === 0) {
        setOverride(null);
      }
    };
  }, [history, setOverride]);

  return (
    <LocationLockerContext.Provider value={lock}>
      <Route location={locationOverride || location}>
        {props.children}
      </Route>
    </LocationLockerContext.Provider>
  );
}

export function useLocationLocker(): LockLocation {
  return React.useContext(LocationLockerContext);
}
