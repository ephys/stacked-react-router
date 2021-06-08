import type { Location } from 'history';
import { Component, Fragment, ReactNode } from 'react';
import { matchPath, Switch, withRouter, RouteComponentProps } from 'react-router-dom';
import CSSTransition from 'react-transition-group/CSSTransition';
import TransitionGroup from 'react-transition-group/TransitionGroup';
import { isRouteGroup } from './route-group';
import styles from './styles.module.scss';

function routeElementMatchesPath(child, pathname) {
  // FIXME: TabRouter has a custom ParameterisedPath, we could call child.type.matchPath when available
  if (!child.props.path) {
    return true;
  }

  return matchPath(pathname, child.props);
}

export type StackRouterTransitionProps = {
  classNames: string,
  timeout: {
    exit: number,
    enter: number,
  },
};

export type StackRouterGetTransition = (isNextPage: boolean) => StackRouterTransitionProps;

type Props = {
  children: ReactNode[],
  transition?: StackRouterGetTransition,
} & RouteComponentProps<any>;

type State = {
  isNextPage: boolean,

  // data that will be out-of-sync from props for one update so we can update their CSS Transition
  renderPreviousData: boolean,
  previousLocation: Location | null,

  keyOverride: string | null,
  previousKey: string | null,

  // data that contains the old props so they can be put in previousData
  oldPropsLocation: Location | null,

  from: Location | null,
};

function areLocationsEqual(a: Location, b: Location): boolean {
  // state?
  return a.pathname === b.pathname && a.search === b.search;
}

class StackRouterImpl extends Component<Props, State> {

  state: State = {
    isNextPage: false,

    renderPreviousData: false,
    previousLocation: null,

    keyOverride: null,
    previousKey: null,

    oldPropsLocation: null,

    from: null,
  };

  static getDerivedStateFromProps(newProps: Props, oldState: State) {

    const { oldPropsLocation, keyOverride } = oldState;
    const newLocation = newProps.location;

    // location.state.transition is used to override the default transition logic
    // by default it transitions except for replacement actions
    // setting .transition to true will force a transition for history replacements
    // setting it to false will disable this route change transition
    const shouldTransition = newLocation.state?.transition ?? (newProps.history.action !== 'REPLACE');

    if (!shouldTransition) {

      return {
        keyOverride: keyOverride || (oldPropsLocation ? oldPropsLocation.key : newLocation.key),
        oldPropsLocation: newLocation,
      };
    }

    if (!oldPropsLocation || !areLocationsInSameGroup(newLocation, oldPropsLocation, newProps.children)) {

      return {
        renderPreviousData: oldPropsLocation != null,
        previousLocation: oldPropsLocation,
        previousKey: keyOverride,

        oldPropsLocation: newLocation,
        keyOverride: newLocation.key,

        isNextPage: isNextPage(oldPropsLocation, newLocation),
        from: oldPropsLocation,
      };
    }

    return null;
  }

  componentDidUpdate(): void {
    this.setState(state => {
      if (state.renderPreviousData) {
        return { renderPreviousData: false, previousLocation: null, previousKey: null };
      }

      return null;
    });
  }

  renderChildren(location, shouldAnimate: boolean, key: string) {
    const activeRoute = getActiveRoute(location, this.props.children);

    if (activeRoute == null) {
      console.error('No route matches the current location. Consider adding a catch-all route');

      return null;
    }

    const animationParams = shouldAnimate && this.props.transition
      ? this.props.transition(this.state.isNextPage)
      : {};

    // TODO: find a way to propagate whether the page is transitioning
    //  so pages can adapt their rendering (and reduce load during transition).
    //  tried using onEnter / onEntered / etc... hooks but it causes a serious delay.
    return (
      <CSSTransition
        timeout={1}
        {...animationParams}
        key={key}
        className={styles.transitionGroup}
      >
        <div>
          <Switch location={location}>
            {activeRoute}
          </Switch>
        </div>
      </CSSTransition>
    );
  }

  isInRouteGroup(location: Location) {
    return getLocationRouteGroup(location, this.props.children) != null;
  }

  render() {
    const location = this.state.renderPreviousData ? this.state.previousLocation : this.props.location;
    const locationKey = this.state.renderPreviousData ? this.state.previousKey : this.state.keyOverride;
    const shouldAnimate = this.state.from != null && !(
      this.isInRouteGroup(this.state.from)
      && this.isInRouteGroup(this.props.location)
    );

    return (
      <TransitionGroup className={styles.transitionGroupWrapper}>
        {this.renderChildren(location, shouldAnimate, locationKey)}
      </TransitionGroup>
    );
  }
}

function getActiveRoute(location: Location, children: ReactNode[]): ReactNode | null {
  for (const child of children) {
    if (child.type === Fragment) {
      const match = getActiveRoute(location, child.props.children);

      if (match) {
        return match;
      }

      continue;
    }

    if (routeElementMatchesPath(child, location.pathname)) {
      return child;
    }
  }

  return null;
}

function areLocationsInSameGroup(locationA: Location, locationB: Location, routeElements: ReactNode[]) {
  if (areLocationsEqual(locationA, locationB)) {
    return true;
  }

  const groupA = getLocationRouteGroup(locationB, routeElements);

  return groupA != null && groupA === getLocationRouteGroup(locationA, routeElements);
}

function getLocationRouteGroup(location: Location, children: ReactNode[]): ReactNode | null {
  const activeChild = getActiveRoute(location, children);

  if (activeChild == null) {
    return null;
  }

  if (isRouteGroup(activeChild)) {
    return activeChild;
  }

  return null;
}

function isNextPage(from: Location | null, to: Location) {
  if (!from) {
    return false;
  }

  return !(from.state && from.state.previousLoc && from.state.previousLoc.key === to.key);
}

export const StackRouter = withRouter(StackRouterImpl);
