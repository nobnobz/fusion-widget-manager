export type WidgetType = 'collection.row' | 'row.classic';

export interface AddonCatalogPayload {
  addonId: string;
  catalogId: string;
  catalogType: string;
}

export interface AIOMetadataCatalog {
  id: string;
  name: string;
  type: string;
  displayType?: string;
}

export interface AddonCatalogDataSource {
  kind: 'addonCatalog';
  payload: AddonCatalogPayload;
}

export interface CollectionItem {
  id: string;
  name: string;
  hideTitle: boolean;
  layout: 'Wide' | 'Poster' | 'Square';
  backgroundImageURL: string;
  dataSource: AddonCatalogDataSource;
  dataSources: AddonCatalogDataSource[];
}

export interface CollectionDataSource {
  kind: 'collection';
  payload: {
    items: CollectionItem[];
  };
}

export interface Presentation {
  aspectRatio: 'poster' | 'wide' | 'square';
  cardStyle: 'small' | 'medium' | 'large';
  badges: {
    providers: boolean;
    ratings: boolean;
  };
  backgroundImageURL?: string;
}

export interface BaseWidget {
  id: string;
  title: string;
  hideTitle?: boolean;
  type: WidgetType;
}

export interface CollectionRowWidget extends BaseWidget {
  type: 'collection.row';
  dataSource: CollectionDataSource;
}

export interface RowClassicWidget extends BaseWidget {
  type: 'row.classic';
  cacheTTL: number;
  limit: number;
  presentation: Presentation;
  dataSource: AddonCatalogDataSource;
}

export type Widget = CollectionRowWidget | RowClassicWidget;

export interface FusionWidgetsConfig {
  exportType: 'fusionWidgets';
  exportVersion: number;
  widgets: Widget[];
}
