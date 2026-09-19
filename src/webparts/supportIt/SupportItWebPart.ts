import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import type { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import SupportIt from './components/SupportIt';
import type { ISupportItProps } from './components/ISupportItProps';
import { SharePointTicketService } from './services/SharePointTicketService';

export interface ISupportItWebPartProps {}

export default class SupportItWebPart extends BaseClientSideWebPart<ISupportItWebPartProps> {
  public render(): void {
    const element: React.ReactElement<ISupportItProps> = React.createElement(SupportIt, {
      service: new SharePointTicketService(this.context),
      userDisplayName: this.context.pageContext.user.displayName
    });
    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return { pages: [] };
  }
}
