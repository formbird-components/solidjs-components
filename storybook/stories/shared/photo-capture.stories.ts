import '../../../solidjs-components-shared/components/photo-capture/src/main';
import { fixtures, procurement, sharedForms } from '../../src/apps';
import { elementMeta, elementStory, type Args, type Story } from '../../src/story';
import type { Meta } from '@storybook/html-vite';

export default { title: 'Shared/Photo capture', ...elementMeta('solid-photo-capture') } satisfies Meta<Args>;

export const Photos: Story = {
  name: 'Photos',
  ...elementStory({
    app: 'shared',
    form: fixtures.incident,
    template: fixtures.incidentTemplate,
    definition: fixtures.definitionFor('photosArr', fixtures.incidentTemplate),
    height: 520,
    description: 'Photos on a record, taken or uploaded, downscaled and captioned, in a gallery with a lightbox.',
  }),
};

export const ViewOnly: Story = {
  name: 'View only',
  ...elementStory({
    app: 'shared',
    form: fixtures.incident,
    template: fixtures.incidentTemplate,
    definition: { ...fixtures.definitionFor('photosArr', fixtures.incidentTemplate), mode: 'view' },
    height: 460,
    description: 'The gallery without adding or removing photos.',
  }),
};

export const Attachments: Story = {
  name: 'Any files',
  ...elementStory({
    app: 'shared',
    form: sharedForms.incidentFiles,
    template: fixtures.incidentTemplate,
    definition: { ...fixtures.definitionFor('photosArr', fixtures.incidentTemplate), allowFiles: true, label: 'Attachments' },
    height: 420,
    description: 'With allowFiles, any file can be added, not just photos.',
  }),
};

export const Documents: Story = {
  name: 'Documents list (procurement)',
  ...elementStory({
    app: 'procurement',
    form: procurement.draft,
    template: procurement.template,
    definition: procurement.definitions.docs,
    wide: true,
    height: 480,
    description: 'Layout "list": documents as rows with a type each (quote, invoice), and PDFs previewed in the lightbox. The files here are stand-ins.',
  }),
};

export const FileReference: Story = {
  name: 'File reference',
  ...elementStory({
    app: 'shared',
    form: fixtures.pdfReference,
    template: fixtures.fileReferenceTemplate,
    definition: fixtures.definitionFor('fileDetails', fixtures.fileReferenceTemplate),
    height: 420,
    description: 'fieldtec-web\'s file reference document, holding a PDF.',
  }),
};
