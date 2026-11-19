import type { Preview } from '@storybook/html-vite';
// The `OL` global that fieldtec-web's openlayers-shared sets, for <solid-map> (test build of it).
import '../../solidjs-components-shared/packages/test-openlayers/index';
import './preview.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { expanded: true, sort: 'requiredFirst' },
    docs: {
      toc: true,
      // Each story installs its own app's in-memory host on the page, so on a docs page every story
      // runs in its own frame.
      story: { inline: false, iframeHeight: 420 },
    },
    options: {
      storySort: { order: ['Introduction', 'Shared', 'Issue tracker', 'Fleet', 'Work health and safety', 'HR', 'Procurement'] },
    },
  },
  globalTypes: {
    theme: {
      description: 'fieldtec-web colour theme (body.dark-theme)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (story, context) => {
      // fieldtec-web's ThemeService toggles this class; the elements follow it.
      document.body.classList.toggle('dark-theme', context.globals.theme === 'dark');
      return story();
    },
  ],
};

export default preview;
