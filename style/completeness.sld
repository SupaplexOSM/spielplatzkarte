<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" version="1.1.0" xmlns:sld="http://www.opengis.net/sld" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:se="http://www.opengis.net/se" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.1.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>completeness</Name>
    <UserStyle>
      <Name>completeness</Name>
      <FeatureTypeStyle>

        <!-- bug_level = 1 -->
        <Rule>
          <Name>bug_level 1</Name>

          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>bug_level</ogc:PropertyName>
              <ogc:Literal>1</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>

          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>
                  triangle
                </WellKnownName>
                
                <Fill>
                  <SvgParameter name="fill">#d40000</SvgParameter>
                </Fill>

                <Stroke>
                  <SvgParameter name="stroke">#303030</SvgParameter>
                  <SvgParameter name="stroke-width">1.2</SvgParameter>
                </Stroke>
              </Mark>
              <Size>
                30
              </Size>

            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- bug_level = 2 -->
        <Rule>
          <Name>bug_level 2</Name>

          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>bug_level</ogc:PropertyName>
              <ogc:Literal>2</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>

          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>
                  triangle
                </WellKnownName>
                
                <Fill>
                  <SvgParameter name="fill">#d4b700</SvgParameter>
                </Fill>

                <Stroke>
                  <SvgParameter name="stroke">#303030</SvgParameter>
                  <SvgParameter name="stroke-width">0.9</SvgParameter>
                </Stroke>
              </Mark>
              <Size>
                18
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- bug_level = 3 -->
        <Rule>
          <Name>bug_level 3</Name>

          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>bug_level</ogc:PropertyName>
              <ogc:Literal>3</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>

          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>
                  triangle
                </WellKnownName>
                
                <Fill>
                  <SvgParameter name="fill">#d49200</SvgParameter>
                </Fill>

                <Stroke>
                  <SvgParameter name="stroke">#303030</SvgParameter>
                  <SvgParameter name="stroke-width">0.9</SvgParameter>
                </Stroke>
              </Mark>
              <Size>
                18
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- bug_level = 4 -->
        <Rule>
          <Name>bug_level 4</Name>

          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>bug_level</ogc:PropertyName>
              <ogc:Literal>4</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>

          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>
                  circle
                </WellKnownName>
                
                <Fill>
                  <SvgParameter name="fill">#78c9ed</SvgParameter>
                </Fill>

                <Stroke>
                  <SvgParameter name="stroke">#303030</SvgParameter>
                  <SvgParameter name="stroke-width">0.9</SvgParameter>
                </Stroke>
              </Mark>
              <Size>
                12
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- bug_level = 5 -->
        <Rule>
          <MaxScaleDenominator>50000</MaxScaleDenominator>

          <Name>bug_level 5</Name>

          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>bug_level</ogc:PropertyName>
              <ogc:Literal>5</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>

          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>
                  circle
                </WellKnownName>
                
                <Fill>
                  <SvgParameter name="fill">#1dcd29</SvgParameter>
                </Fill>

                <Stroke>
                  <SvgParameter name="stroke">#303030</SvgParameter>
                  <SvgParameter name="stroke-width">0.5</SvgParameter>
                </Stroke>
              </Mark>
              <Size>
                5
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <VendorOption name="sortBy">bug_level D</VendorOption>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
