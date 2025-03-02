import { isDocument } from '../util/element';
import { createRenderContext, executeContext, printRenderStats } from './cursor';
import { isJSXNode, jsx, processData } from './jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from './jsx/types/jsx-node';
import { visitJsxNode } from './render';
import { getContainerState } from './notify-render';
import { getDocument } from '../util/dom';
import { qDev, qTest } from '../util/qdev';
import { version } from '../version';
import { QContainerAttr } from '../util/markers';
import { logError } from '../util/log';
import { runWatch, WatchDescriptor, WatchFlagsIsDirty } from '../use/use-watch';
import { appendQwikDevTools, getContext } from '../props/props';
import { codeToText, QError_cannotRenderOverExistingContainer } from '../error/error';
import { directSetAttribute } from './fast-calls';

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means
 * it always tries to reuse what is already in the DOM (rather then destroy and
 * recreate content.)
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @alpha
 */
export const render = async (
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>
): Promise<void> => {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  const doc = getDocument(parent);
  const containerEl = getElement(parent);
  if (qDev && containerEl.hasAttribute(QContainerAttr)) {
    logError(codeToText(QError_cannotRenderOverExistingContainer));
    return;
  }
  injectQContainer(containerEl);

  const containerState = getContainerState(containerEl);
  const ctx = createRenderContext(doc, containerState, containerEl);
  ctx.$roots$.push(parent as Element);

  const processedNodes = await processData(jsxNode);
  await visitJsxNode(ctx, parent as Element, processedNodes, false);

  executeContext(ctx);
  if (!qTest) {
    injectQwikSlotCSS(parent);
  }

  if (qDev) {
    appendQwikDevTools(containerEl);
    printRenderStats(ctx);
  }
  const promises: Promise<WatchDescriptor>[] = [];
  ctx.$hostElements$.forEach((host) => {
    const elCtx = getContext(host);
    elCtx.$watches$.forEach((watch) => {
      if (watch.f & WatchFlagsIsDirty) {
        promises.push(runWatch(watch, containerState));
      }
    });
  });
  await Promise.all(promises);
};

export const injectQwikSlotCSS = (docOrElm: Document | Element) => {
  const doc = getDocument(docOrElm);
  const element = isDocument(docOrElm) ? docOrElm.head : docOrElm;
  const style = doc.createElement('style');
  directSetAttribute(style, 'id', 'qwik/base-styles');
  style.textContent = `q\\:slot{display:contents}q\\:fallback,q\\:template{display:none}q\\:fallback:last-child{display:contents}`;
  element.insertBefore(style, element.firstChild);
};

export const getElement = (docOrElm: Document | Element): Element => {
  return isDocument(docOrElm) ? docOrElm.documentElement : docOrElm;
};

export const injectQContainer = (containerEl: Element) => {
  directSetAttribute(containerEl, 'q:version', version || '');
  directSetAttribute(containerEl, QContainerAttr, 'resumed');
};
