import * as React from 'react';
import { RouteLink } from '../utils/routing-utils';
import { HistoryTrackerContext, HistoryTracker } from './history-tracker';

type Props = Omit<React.ComponentProps<typeof RouteLink>, 'pop' | 'replace' | 'to'> & {
  defaultBackPath: string,
};

// The back button is a link to enable ctrl+click or copying the link
// but clicking on it rewinds the browser history.
export const BaseBackButton = React.forwardRef<HTMLAnchorElement, Props>((props, ref) => {
  const historyTracker: HistoryTracker | null = React.useContext(HistoryTrackerContext);

  const previousRoute = historyTracker && historyTracker.getPreviousLocation();
  const hasPreviousRoute = Boolean(previousRoute);

  const { defaultBackPath, ...passDown } = props;

  return (
    <RouteLink
      {...passDown}
      ref={ref}
      pop={hasPreviousRoute}
      replace={!hasPreviousRoute}
      to={hasPreviousRoute ? previousRoute : defaultBackPath}
    />
  );
});
