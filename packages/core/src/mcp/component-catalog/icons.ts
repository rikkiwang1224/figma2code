/**
 * Icon catalog summary for Ant Design (@ant-design/icons).
 */

import type { PlatformType } from '../../runtime/types/platform.js';

const ANT_DESIGN_ICONS_SUMMARY = `## Icons (@ant-design/icons)

**Import**: \`import { SearchOutlined, PlusOutlined } from '@ant-design/icons';\`

**Naming**: PascalCase icon name + style suffix, e.g. \`SearchOutlined\`, \`PlusFilled\`, \`CloseCircleTwoTone\`.

**Common icons**: SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, SettingOutlined, QuestionCircleOutlined, InfoCircleOutlined, ExclamationCircleOutlined, CheckOutlined, CloseOutlined, ArrowUpOutlined, ArrowDownOutlined, MenuOutlined, EllipsisOutlined, FilterOutlined, ReloadOutlined, ExportOutlined, ImportOutlined.

Use outlined icons by default unless the design clearly uses filled/two-tone variants.`;

export function getIconsSummary(platform: PlatformType | 'ant-design'): string {
  if (platform === 'h5') {
    return 'H5 icon catalog is not available in the open-source Ant Design build.';
  }
  return ANT_DESIGN_ICONS_SUMMARY;
}
