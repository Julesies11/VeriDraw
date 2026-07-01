import { useEffect } from 'react';
import { useLocation } from 'react-router';

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
