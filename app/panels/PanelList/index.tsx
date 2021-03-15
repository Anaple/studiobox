// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.
import MagnifyIcon from "@mdi/svg/svg/magnify.svg";
import fuzzySort from "fuzzysort";
import { flatten, flatMap, isEqual } from "lodash";
import { useDrag } from "react-dnd";
import { MosaicDragType } from "react-mosaic-component";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";

import styles from "./index.module.scss";
import { dropPanel } from "@foxglove-studio/app/actions/panels";
import Flex from "@foxglove-studio/app/components/Flex";
import Icon from "@foxglove-studio/app/components/Icon";
import { Item } from "@foxglove-studio/app/components/Menu";
import TextHighlight from "@foxglove-studio/app/components/TextHighlight";
import { getGlobalHooks } from "@foxglove-studio/app/loadWebviz";
import { TabPanelConfig } from "@foxglove-studio/app/types/layouts";
import {
  PanelConfig,
  MosaicPath,
  MosaicDropTargetPosition,
  SavedProps,
} from "@foxglove-studio/app/types/panels";
import { objectValues } from "@foxglove-studio/app/util";
import { colors } from "@foxglove-studio/app/util/sharedStyleConstants";

const StickyDiv = styled.div`
  color: ${colors.LIGHT};
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: ${colors.DARK3};
`;

const STitle = styled.h1`
  padding: 16px 16px 0px 16px;
  font-size: 14;
`;

const SDescription = styled.div`
  padding: 8px 16px 16px;
  opacity: 0.6;
`;

const SSearchInputContainer = styled(Flex)`
  padding-left: 8px;
  background-color: ${colors.DARK5};
  border-radius: 4px;
`;

const SSearchInput = styled.input`
  background-color: ${colors.DARK5};
  padding: 8px;
  width: 100%;
  min-width: 200px;
  margin: 0;

  &:hover,
  &:focus {
    background-color: ${colors.DARK5};
  }
`;

const SScrollContainer = styled.div`
  overflow-y: auto;
  height: calc(100% - 142px);
  padding-bottom: 8px;
  background-color: ${colors.DARK3};
`;

const SEmptyState = styled.div`
  padding: 0px 16px 16px;
  opacity: 0.4;
`;

type PresetSettings =
  | { config: TabPanelConfig; relatedConfigs: SavedProps }
  | { config: PanelConfig; relatedConfigs: typeof undefined };
export type PanelListItem = {
  title: string;
  component: React.ComponentType<any>;
  presetSettings?: PresetSettings;
};

// getPanelsByCategory() and getPanelsByType() are functions rather than top-level constants
// in order to avoid issues with circular imports, such as
// FooPanel -> PanelToolbar -> PanelList -> getGlobalHooks().panelsByCategory() -> FooPanel.
let gPanelsByCategory: any;
function getPanelsByCategory(): {
  [category: string]: PanelListItem[];
} {
  if (!gPanelsByCategory) {
    gPanelsByCategory = getGlobalHooks().panelsByCategory();

    for (const category in gPanelsByCategory) {
      gPanelsByCategory[category] = gPanelsByCategory[category].filter(Boolean);
    }
  }
  return gPanelsByCategory;
}

let gPanelsByType: any;
export function getPanelsByType(): {
  [type: string]: PanelListItem;
} {
  if (!gPanelsByType) {
    gPanelsByType = {};
    const panelsByCategory = getPanelsByCategory();
    for (const category in panelsByCategory) {
      const nonPresetPanels = panelsByCategory[category].filter(
        (panel) => panel && !panel.presetSettings,
      );
      for (const item of nonPresetPanels) {
        const panelType = (item.component as any).panelType;
        console.assert(panelType && !(panelType in gPanelsByType));
        gPanelsByType[panelType] = item;
      }
    }
  }
  return gPanelsByType;
}

type DropDescription = {
  type: string;
  config?: PanelConfig;
  relatedConfigs?: SavedProps;
  position: MosaicDropTargetPosition;
  path: MosaicPath;
  tabId?: string;
};
type PanelItemProps = {
  panel: {
    type: string;
    title: string;
    config?: PanelConfig;
    relatedConfigs?: SavedProps;
  };
  searchQuery: string;
  checked?: boolean;
  highlighted?: boolean;
  onClick: () => void;
  // the props here are actually used in the dragSource
  // beginDrag and endDrag callbacks - the props are passed via react-dnd
  // so keep the flow defs here so those functions can have access to some type info
  mosaicId: string; //eslint-disable-line react/no-unused-prop-types
  onDrop: (arg0: DropDescription) => void; //eslint-disable-line react/no-unused-prop-types
};

function DraggablePanelItem({
  searchQuery,
  panel,
  onClick,
  onDrop,
  checked,
  highlighted,
  mosaicId,
}: PanelItemProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [__, drag] = useDrag({
    item: { type: MosaicDragType.WINDOW },
    begin: (_monitor) => ({ mosaicId } as any),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult() || {};
      const { position, path, tabId } = dropResult;
      // dropping outside mosaic does nothing. If we have a tabId, but no
      // position or path, we're dragging into an empty tab.
      if ((!position || !path) && !tabId) {
        return;
      }
      const { type, config, relatedConfigs } = panel;
      onDrop({ type, config, relatedConfigs, position, path, tabId });
    },
  });

  React.useEffect(() => {
    if (highlighted && scrollRef.current) {
      const highlightedItem = scrollRef.current.getBoundingClientRect();
      const scrollContainer = scrollRef.current?.parentElement?.parentElement?.parentElement;
      if (scrollContainer) {
        const scrollContainerToTop = scrollContainer.getBoundingClientRect().top;

        const isInView =
          highlightedItem.top >= 0 &&
          highlightedItem.top >= scrollContainerToTop &&
          highlightedItem.top + 50 <= window.innerHeight;

        if (!isInView && scrollRef.current) {
          scrollRef.current.scrollIntoView();
        }
      }
    }
  }, [highlighted]);

  return (
    <div ref={drag}>
      <div ref={scrollRef}>
        <Item
          onClick={onClick}
          checked={checked}
          highlighted={highlighted}
          className={styles.item}
          dataTest={`panel-menu-item ${panel.title}`}
        >
          <TextHighlight targetStr={panel.title} searchText={searchQuery} />
        </Item>
      </div>
    </div>
  );
}

export type PanelSelection = {
  type: string;
  config?: PanelConfig;
  relatedConfigs?: {
    [panelId: string]: PanelConfig;
  };
};
type Props = {
  onPanelSelect: (arg0: PanelSelection) => void;
  selectedPanelTitle?: string;
};

// sanity checks to help panel authors debug issues
function verifyPanels() {
  const panelTypes: Map<
    string,
    { component: React.ComponentType<any>; presetSettings?: PresetSettings }
  > = new Map();
  const panelsByCategory = getPanelsByCategory();
  for (const category in panelsByCategory) {
    for (const { component, presetSettings } of panelsByCategory[category]) {
      const { name, displayName, panelType } = component as any;
      if (!panelType) {
        throw new Error(
          `Panel component ${
            displayName || name || "<unnamed>"
          } must declare a unique \`static panelType\``,
        );
      }
      const existingPanel = panelTypes.get(panelType);
      if (existingPanel && isEqual(existingPanel.presetSettings, presetSettings)) {
        throw new Error(
          `Two components have the same panelType ('${panelType}') and same presetSettings: ${
            existingPanel.component.displayName || existingPanel.component.name || "<unnamed>"
          } and ${displayName || name || "<unnamed>"}`,
        );
      }
      panelTypes.set(panelType, { component, presetSettings });
    }
  }
}

function PanelList(props: Props) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [highlightedPanelIdx, setHighlightedPanelIdx] = React.useState<number | undefined>();
  const { onPanelSelect, selectedPanelTitle } = props;

  const dispatch = useDispatch();
  const { mosaicId }: { mosaicId: string } = useSelector((state: any) => ({
    mosaicId: state.mosaic.mosaicId,
  }));

  // Update panel layout in Redux when a panel menu item is dropped;
  // actual operations to change layout supplied by react-mosaic-component
  const onPanelMenuItemDrop = React.useCallback(
    ({ config, relatedConfigs, type, position, path, tabId }: DropDescription) => {
      dispatch(
        dropPanel({
          newPanelType: type,
          destinationPath: path,
          position,
          tabId,
          config,
          relatedConfigs,
        }),
      );
    },
    [dispatch],
  );

  const handleSearchChange = React.useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    // TODO(Audrey): press enter to select the first item, allow using arrow key to go up and down
    setSearchQuery((e.target as any).value);
    setHighlightedPanelIdx(0);
  }, []);

  verifyPanels();
  const panelCategories = React.useMemo(() => getGlobalHooks().panelCategories(), []);
  const panelsByCategory = React.useMemo(() => getPanelsByCategory(), []);
  const getFilteredItemsForCategory = React.useCallback(
    (key: string) =>
      searchQuery
        ? fuzzySort
            .go(searchQuery, panelsByCategory[key], { key: "title" })
            .map((searchResult) => searchResult.obj)
        : panelsByCategory[key],
    [panelsByCategory, searchQuery],
  );
  const filteredItemsByCategoryIdx = React.useMemo(
    () => panelCategories.map(({ key }) => getFilteredItemsForCategory(key)),
    [getFilteredItemsForCategory, panelCategories],
  );

  const noResults = React.useMemo(
    () => filteredItemsByCategoryIdx.every((items) => !items.length),
    [filteredItemsByCategoryIdx],
  );

  const filteredItems = React.useMemo(() => flatMap(Object.values(filteredItemsByCategoryIdx)), [
    filteredItemsByCategoryIdx,
  ]);

  const highlightedPanel = React.useMemo(
    () => (highlightedPanelIdx != undefined ? filteredItems[highlightedPanelIdx] : null),
    [filteredItems, highlightedPanelIdx],
  );

  const onKeyDown = React.useCallback(
    (e) => {
      if (e.key === "ArrowDown" && highlightedPanelIdx != undefined) {
        setHighlightedPanelIdx((highlightedPanelIdx + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp" && highlightedPanelIdx != undefined) {
        const newIdx = (highlightedPanelIdx - 1) % (filteredItems.length - 1);
        setHighlightedPanelIdx(newIdx >= 0 ? newIdx : filteredItems.length + newIdx);
      } else if (e.key === "Enter" && highlightedPanel) {
        const { component, presetSettings } = highlightedPanel;
        onPanelSelect({
          type: (component as any).panelType,
          config: presetSettings?.config,
          relatedConfigs: presetSettings?.relatedConfigs,
        });
      }
    },
    [filteredItems.length, highlightedPanel, highlightedPanelIdx, onPanelSelect],
  );

  const displayPanelListItem = React.useCallback(
    ({ presetSettings, title, component: { panelType } }) => {
      return (
        <DraggablePanelItem
          key={`${panelType}-${title}`}
          mosaicId={mosaicId}
          panel={{
            type: panelType,
            title,
            config: presetSettings?.config,
            relatedConfigs: presetSettings?.relatedConfigs,
          }}
          onDrop={onPanelMenuItemDrop}
          onClick={() =>
            onPanelSelect({
              type: panelType,
              config: presetSettings?.config,
              relatedConfigs: presetSettings?.relatedConfigs,
            })
          }
          checked={title === selectedPanelTitle}
          highlighted={highlightedPanel?.title === title}
          searchQuery={searchQuery}
        />
      );
    },
    [
      highlightedPanel,
      mosaicId,
      onPanelMenuItemDrop,
      onPanelSelect,
      searchQuery,
      selectedPanelTitle,
    ],
  );

  return (
    <div data-test-panel-category style={{ height: "100%", width: "320px" }}>
      <StickyDiv>
        <STitle>Add panel</STitle>
        <SDescription>
          Click to select a new panel or drag and drop to place a new panel.
        </SDescription>
        <hr />
        <div style={{ padding: "16px" }}>
          <SSearchInputContainer center>
            <Icon style={{ color: colors.LIGHT, opacity: 0.3 }}>
              <MagnifyIcon />
            </Icon>
            <SSearchInput
              placeholder="Search panels"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={onKeyDown}
              onBlur={() => setHighlightedPanelIdx(undefined)}
              onFocus={() => setHighlightedPanelIdx(0)}
              autoFocus
            />
          </SSearchInputContainer>
        </div>
      </StickyDiv>
      <SScrollContainer>
        {noResults && <SEmptyState>No panels match search criteria.</SEmptyState>}
        {panelCategories.map(({ label }, categoryIdx) => {
          const prevItems = flatMap(filteredItemsByCategoryIdx.slice(0, categoryIdx));
          if (!filteredItemsByCategoryIdx[categoryIdx].length) {
            return null;
          }
          return (
            <div key={label} style={{ paddingTop: "8px" }}>
              {categoryIdx !== 0 && prevItems.length > 0 && <hr />}
              <Item
                isHeader
                style={categoryIdx === 0 || !prevItems.length ? { paddingTop: 0 } : {}}
              >
                {label}
              </Item>
              {filteredItemsByCategoryIdx[categoryIdx].map(displayPanelListItem)}
            </div>
          );
        })}
      </SScrollContainer>
    </div>
  );
}

PanelList.getComponentForType = (type: string): any | void => {
  const panelsByCategory = getPanelsByCategory();
  const allPanels = flatten(objectValues(panelsByCategory));
  const panel = allPanels.find((item) => (item.component as any).panelType === type);
  return panel?.component;
};

export default PanelList;
