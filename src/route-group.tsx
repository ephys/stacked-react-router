import * as React from 'react';
import { Route } from 'react-router-dom';

// react
export const IS_ROUTE_GROUP_TAG = '__NAV_IS_SEPARATOR_TAG__';

export function RouteGroup(props) {
  return <Route {...props} />;
}

RouteGroup[IS_ROUTE_GROUP_TAG] = true;

export function isRouteGroup(routeComponent: React.ReactNode): boolean {
  if (!React.isValidElement(routeComponent)) {
    return false;
  }

  if (!routeComponent.type) {
    return false;
  }

  return routeComponent.type[IS_ROUTE_GROUP_TAG] === true;
}
