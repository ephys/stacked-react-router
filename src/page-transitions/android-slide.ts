import type { StackRouterTransitionProps } from '../stack-router';
import as from './android-slide.module.scss';

// FIXME we are forced to use the import even though
//   everything in it is global, otherwise webpack drops it in production
if (as == null) {
  console.error('android-slide css failed to load');
}

const timeout = Object.freeze({
  exit: 300,
  enter: 300,
});

export function srAndroidTransitionSlide(forwardNavigation): StackRouterTransitionProps {

  return {
    // whole page moving from left to right = backward nav
    // whole page moving from right to left = forward nav
    classNames: forwardNavigation ? 'android-slide-left' : 'android-slide-right',
    timeout,
  };
}
