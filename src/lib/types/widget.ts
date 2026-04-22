export type WidgetType = 'collection.row' | 'row.classic';
export type SourceType = 'aiometadata' | 'trakt-native' | 'anilist-native';

export interface AddonCatalogPayload {
  addonId: string;
  catalogId: string;
  catalogType: string;
}

export interface TraktListPayload {
  listName: string;
  listSlug: string;
  traktId: number | string | null;
  username: string;
}

export interface AnilistCatalogPayload {
  catalogType: string;
  limit: number;
}

export interface AIOMetadataCatalog {
  id: string;
  name: string;
  type: string;
  displayType?: string;
}

export interface AiometadataCatalogsOnlyEntry {
  id: string;
  type: string;
  name: string;
  enabled: true;
  source: 'trakt' | 'mdblist' | 'streaming' | 'simkl' | 'letterboxd' | 'anilist';
  displayType?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  sortDirection?: 'asc' | 'desc';
  cacheTTL?: number;
}

export interface AiometadataCatalogsOnlyExport {
  version: 1;
  exportedAt: string;
  catalogs: AiometadataCatalogsOnlyEntry[];
}

export interface AIOMetadataDataSource {
  sourceType: 'aiometadata';
  kind: 'addonCatalog';
  payload: AddonCatalogPayload;
}

export interface NativeTraktDataSource {
  sourceType: 'trakt-native';
  kind: 'traktList';
  payload: TraktListPayload;
}

export interface NativeAnilistDataSource {
  sourceType: 'anilist-native';
  kind: 'anilistCatalog';
  payload: AnilistCatalogPayload;
}

export type AddonCatalogDataSource = AIOMetadataDataSource;
export type WidgetDataSource = AIOMetadataDataSource | NativeTraktDataSource | NativeAnilistDataSource;

export interface CollectionItem {
  id: string;
  name: string;
  hideTitle: boolean;
  layout: 'Wide' | 'Poster' | 'Square';
  backgroundImageURL: string;
  dataSources: WidgetDataSource[];
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
  dataSource: WidgetDataSource;
}

export type Widget = CollectionRowWidget | RowClassicWidget;

export interface TrashWidgetEntry {
  widget: Widget;
  deletedAt: string;
  originalIndex: number;
}

export interface TrashCollectionItemEntry {
  widgetId: string;
  widgetTitle: string;
  item: CollectionItem;
  deletedAt: string;
  originalIndex: number;
}

export interface FusionWidgetsConfig {
  exportType: 'fusionWidgets';
  exportVersion: number;
  widgets: Widget[];
}
