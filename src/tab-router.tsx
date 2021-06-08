import { createLocation, LocationDescriptor, Action as HistoryAction } from 'history';
import { ComponentProps, createContext, forwardRef, ReactNode, useContext, useMemo } from 'react';
import { matchPath, useLocation, Route } from 'react-router-dom';
import { RouteLink } from '../utils/routing-utils';
import { IS_ROUTE_GROUP_TAG } from './route-group';

const TabRouterContext = createContext(null);

type Props = {
  children: ReactNode,
  path: Array<string | ParameterisedPath>,
  index: string | ParameterisedPath,
} & Omit<ComponentProps<typeof Route>, 'path'>;

export function TabRouter(props: Props) {
  const fromLocation = useLocation();

  const { path: paths, index, ...passDown } = props;

  const context = useMemo(() => {

    function matchPathExtended(newLocation: string | LocationDescriptor, pathTemplate: string | ParameterisedPath) {
      const isExact = pathTemplate instanceof ParameterisedPath ? pathTemplate.getIsExact() : true;
      const pathString = pathTemplate instanceof ParameterisedPath ? pathTemplate.getPath() : pathTemplate;

      const locationPathname = typeof newLocation === 'string' ? newLocation : newLocation.pathname;

      if (!matchPath(locationPathname, { exact: isExact, path: pathString })) {
        return false;
      }

      if (!(pathTemplate instanceof ParameterisedPath)) {
        return true;
      }

      const newLocationObj = typeof newLocation === 'string' ? createLocation(newLocation, null, null, fromLocation) : newLocation;

      return pathTemplate.getMatcher()(newLocationObj, pathTemplate);
    }

    function isLocationTabIndex(pathname: string | LocationDescriptor): boolean {
      return matchPathExtended(pathname, index);
    }

    function isLocationInTabGroup(pathname: string | LocationDescriptor): boolean {
      for (const path of paths) {
        if (matchPathExtended(pathname, path)) {
          return true;
        }
      }

      return false;
    }

    function isPreviousLocIndex(): boolean {
      if (!fromLocation.state || !fromLocation.state.previousLoc || !fromLocation.state.previousLoc.pathname) {
        return false;
      }

      return isLocationTabIndex(fromLocation.state.previousLoc.pathname);
    }

    return {
      getNavigationType(destination: string | LocationDescriptor): HistoryAction {
        // navigation outside of the group is a push
        if (!isLocationInTabGroup(fromLocation)) {
          return 'PUSH';
        }

        if (!isLocationInTabGroup(destination)) {
          return 'PUSH';
        }

        // going from index page to anything else in the group is a push
        if (isLocationTabIndex(fromLocation)) {
          return 'PUSH';
        }

        // going from anything else in the group to the index is a pop
        if (isLocationTabIndex(destination) && isPreviousLocIndex()) {
          return 'POP';
        }

        return 'REPLACE';
      },
    };
  }, [paths, fromLocation, index]);

  return (
    <Route {...passDown} path={normalizePaths(paths)}>
      <TabRouterContext.Provider value={context}>
        {props.children}
      </TabRouterContext.Provider>
    </Route>
  );
}

function normalizePaths(paths: Array<string | ParameterisedPath>): string[] {
  return paths.map(path => {
    return path instanceof ParameterisedPath ? path.getPath() : path;
  });
}

type TabLinkProps = ComponentProps<typeof RouteLink>;

export const TabLink = forwardRef<HTMLAnchorElement>((props: TabLinkProps, ref) => {
  const tabRouterContext = useContext(TabRouterContext);

  const navType = tabRouterContext && tabRouterContext.getNavigationType(props.to) || 'PUSH';

  return <RouteLink pop={navType === 'POP'} replace={navType === 'REPLACE'} {...props} ref={ref} />;
});

if (process.env.NODE_ENV !== 'production') {
  TabLink.displayName = 'TabLink';
}

export class ParameterisedPath {
  constructor(path: string) {
    this._path = path;
  }

  pathMatcher(callback: (LocationDescriptor) => boolean): ParameterisedPath {
    this._matchPathCb = callback;

    return this;
  }

  exact(isExact = true) {
    this._exact = isExact;

    return this;
  }

  getIsExact(): boolean {
    return this._exact == null ? true : this._exact;
  }

  getMatcher(): (loc: LocationDescriptor) => boolean {
    return this._matchPathCb || (() => true);
  }

  getPath(): string {
    return this._path;
  }
}

TabRouter[IS_ROUTE_GROUP_TAG] = true;
