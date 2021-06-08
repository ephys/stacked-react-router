import './slide.module.scss';
import type { StackRouterTransitionProps } from '../stack-router';

export function srTransitionSlide(forwardNavigation): StackRouterTransitionProps {

  return {
    // whole page moving from left to right = backward nav
    // whole page moving from right to left = forward nav
    classNames: forwardNavigation ? 'slide-left' : 'slide-right',
    timeout: {
      exit: 500,
      enter: 500,
    },
  };
}
