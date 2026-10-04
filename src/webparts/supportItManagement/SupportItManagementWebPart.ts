import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import type { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import SupportItManagement from './components/SupportItManagement';
import type { ISupportItManagementProps } from './components/ISupportItManagementProps';
import { SharePointTicketService } from '../supportIt/services/SharePointTicketService';

export interface ISupportItManagementWebPartProps {}

export default class SupportItManagementWebPart
  extends BaseClientSideWebPart<ISupportItManagementWebPartProps> {
  public render(): void {
    const element: React.ReactElement<ISupportItManagementProps> = React.createElement(
      SupportItManagement,
      { service: new SharePointTicketService(this.context) }
    );
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
