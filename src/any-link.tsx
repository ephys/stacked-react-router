import { ComponentProps, forwardRef } from 'react';
import { Link as RrLink } from 'react-router-dom';

type Props = ComponentProps<RrLink> & {
  rel?: string,
};

const BASE_REL = 'noopener noreferrer';

/**
 * This component extends the React-Router `Link` component by adding support for external links.
 *
 * {@link https://github.com/ReactTraining/react-router/issues/1147}
 *
 * @param {!Props} props - The props.
 * @returns {!ReactNode} The link element.
 */
const AnyLink = forwardRef<HTMLAnchorElement | HTMLSpanElement, Props>(({ to, ...props }: Props, ref) => {
  // It is a simple element with nothing to link to
  if (!to) {
    return <span {...props} ref={ref} />;
  }

  // It is intended to be an external link
  if (typeof to === 'string' && /^(https?|mailto):/.test(to)) {
    const rel = typeof props.rel === 'string' ? `${props.rel} ${BASE_REL}` : BASE_REL;

    // eslint-disable-next-line react/jsx-no-target-blank
    return <a target="_blank" {...props} href={to} rel={rel} ref={ref} />;
  }

  // Finally, it is an internal link
  return <RrLink {...props} to={to} ref={ref} />;
});

export default AnyLink;
