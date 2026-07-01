import { useEffect } from 'react';
import { useLocation } from 'react-router';

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const mainElement = document.getElementById('main-content') || document.querySelector('main');
    if (mainElement) {
      mainElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
