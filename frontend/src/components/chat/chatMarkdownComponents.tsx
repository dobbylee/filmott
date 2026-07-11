import type { Components } from 'react-markdown';

export const chatMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-4 last:mb-0">
      {children}
    </p>
  ),
};
