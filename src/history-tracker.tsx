
import type { History as RouterHistory, Location, LocationDescriptor } from 'history';
import * as React from 'react';
import { withRouter } from 'react-router-dom';

export class HistoryTracker {

  history: RouterHistory;
  _stopHistoryListener: () => void;
  _lastLocation: Location;

  constructor(history: RouterHistory) {
    this.history = history;

    const loc = history.location;
    if (!loc.key) {
      // replace history to create entry with a key
      history.replace({ ...loc });
    }

    this._lastLocation = history.location;

    // === 🤢 BIG HACK 🤢 ===
    // we replace history.replace & history.push to save `previousLoc` along with it
    // this could be better served if done with a custom history class, but we don't have access to that here.
    const sourceReplace = history.replace;
    const sourcePush = history.push;

    history.replace = (path: string | LocationDescriptor, state?: any) => {
      const currentLocation = this._lastLocation;
      const previousLoc = currentLocation.state && currentLocation.state.previousLoc;

      if (previousLoc) {
        if (typeof path === 'object' && path != null) {
          path = {
            ...path,
            state: {
              ...path.state,
              previousLoc,
            },
          };
        } else {
          state = {
            ...state,
            previousLoc,
          };
        }
      }

      sourceReplace.call(history, path, state);
    };

    history.push = (path: string | LocationDescriptor, state?: any) => {
      if (typeof path === 'object' && path != null) {
        path = {
          ...path,
          state: {
            ...path.state,
            previousLoc: {
              ...this._lastLocation,
              state: void 0,
            },
          },
        };
      } else {
        state = {
          ...state,
          previousLoc: {
            ...this._lastLocation,
            state: void 0,
          },
        };
      }

      sourcePush.call(history, path, state);
    };

    this._stopHistoryListener = history.listen((newLoc, action) => {
      this._lastLocation = newLoc;

      if (action !== 'POP' && !newLoc.state?.previousLoc) {
        console.error(`[history-tracker] ${action}ed location is missing its previousLoc state`, newLoc);
      }
    });
  }

  getPreviousLocation() {
    const state = this.history.location.state;

    return state && state.previousLoc;
  }

  close() {
    this._stopHistoryListener();
  }
}

// ---

export const HistoryTrackerContext = React.createContext<HistoryTracker | null>(null);

type Props = $ReadOnly<{
  children: React.ReactNode,
  history: RouterHistory,
}>;

type State = {
  historyTracker: HistoryTracker,
};

export const HistoryTrackerProvider = withRouter(
  class extends React.Component<Props, State> {

    constructor(props: Props) {
      super(props);

      // linter error
      // eslint-disable-next-line react/state-in-constructor
      this.state = {
        historyTracker: new HistoryTracker(props.history),
      };
    }

    componentWillUnmount() {
      this.state.historyTracker.close();
    }

    render() {

      return (
        <HistoryTrackerContext.Provider value={this.state.historyTracker}>
          {this.props.children}
        </HistoryTrackerContext.Provider>
      );
    }
  },
);
