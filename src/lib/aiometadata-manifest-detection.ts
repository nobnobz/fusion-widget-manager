import { AIOMetadataDataSource, Widget } from '@/lib/types/widget';
import { isAIOMetadataDataSource } from '@/lib/widget-domain';

export interface AiometadataManifestDetectionResult {
  addonIds: string[];
  detectedUrls: string[];
  hasAiometadataSources: boolean;
  hasSingleValidDetectedUrl: boolean;
}

export function getDetectedAiometadataAddonUrl(widgetDataSource: AIOMetadataDataSource): string | null {
  if (!isAIOMetadataDataSource(widgetDataSource)) {
    return null;
  }

  const addonId = String(widgetDataSource.payload.addonId || '').trim();
  if (!addonId.startsWith('http')) {
    return null;
  }

  return addonId.toUpperCase().includes('AIOMETADATA') ? addonId : null;
}

export function collectDetectedAiometadataManifestUrls(widgets: Widget[]): string[] {
  const urls = new Set<string>();

  visitAiometadataSources(widgets, (dataSource) => {
    const detectedUrl = getDetectedAiometadataAddonUrl(dataSource);
    if (detectedUrl) {
      urls.add(detectedUrl);
    }
  });

  return Array.from(urls);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function analyzeAiometadataManifestDetection(widgets: Widget[]): AiometadataManifestDetectionResult {
  const addonIds = new Set<string>();
  const detectedUrls = collectDetectedAiometadataManifestUrls(widgets);

  visitAiometadataSources(widgets, (dataSource) => {
    addonIds.add(String(dataSource.payload.addonId || '').trim());
  });

  return {
    addonIds: Array.from(addonIds),
    detectedUrls,
    hasAiometadataSources: addonIds.size > 0,
    hasSingleValidDetectedUrl: detectedUrls.length === 1 && isValidHttpUrl(detectedUrls[0] || ''),
  };
}

export function getAiometadataManifestDetectionSignature(widgets: Widget[]): string {
  const detection = analyzeAiometadataManifestDetection(widgets);

  return JSON.stringify({
    addonIds: detection.addonIds.filter(Boolean).sort(),
    detectedUrls: detection.detectedUrls.slice().sort(),
    hasAiometadataSources: detection.hasAiometadataSources,
  });
}

export function shouldPromptForAiometadataManifestSetup(widgets: Widget[]): boolean {
  const detection = analyzeAiometadataManifestDetection(widgets);
  return detection.hasAiometadataSources && !detection.hasSingleValidDetectedUrl;
}

function visitAiometadataSources(widgets: Widget[], visitor: (dataSource: AIOMetadataDataSource) => void): void {
  widgets.forEach((widget) => {
    if (widget.type === 'row.classic') {
      if (isAIOMetadataDataSource(widget.dataSource)) {
        visitor(widget.dataSource);
      }
      return;
    }

    widget.dataSource.payload.items.forEach((item) => {
      item.dataSources.forEach((dataSource) => {
        if (isAIOMetadataDataSource(dataSource)) {
          visitor(dataSource);
        }
      });
    });
  });
}
