<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" 
 xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd" 
 xmlns="http://www.opengis.net/sld" 
 xmlns:ogc="http://www.opengis.net/ogc" 
 xmlns:xlink="http://www.w3.org/1999/xlink" 
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <Name>playground_polygon</Name>
    <UserStyle>
      <Title>Playground Polygon</Title>
      <Abstract>Style for playground polygons.</Abstract>
      <FeatureTypeStyle>

        <Rule>
          <MinScaleDenominator>15000</MinScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>

                  <!-- <Fill>
                    <CssParameter name="fill">#ed7014</CssParameter>
                  </Fill> -->

                <Fill>
                  <CssParameter name="fill">
                    <ogc:Function name="if_then_else">
                      <ogc:Function name="equalTo">
                        <ogc:PropertyName>access</ogc:PropertyName>
                        <ogc:Literal>yes</ogc:Literal>
                      </ogc:Function>
                      <ogc:Literal>#ed7014</ogc:Literal>
                      <ogc:Function name="if_then_else">
                        <ogc:Function name="equalTo">
                          <ogc:PropertyName>access</ogc:PropertyName>
                          <ogc:Literal>permissive</ogc:Literal>
                        </ogc:Function>
                        <ogc:Literal>#f9af78</ogc:Literal>
                        <ogc:Function name="if_then_else">
                          <ogc:Function name="isNull">
                            <ogc:PropertyName>access</ogc:PropertyName>
                          </ogc:Function>
                          <ogc:Literal>#f9af78</ogc:Literal>
                          <ogc:Literal>#f69cc3</ogc:Literal>
                        </ogc:Function>
                      </ogc:Function>
                    </ogc:Function>
                  </CssParameter>
                </Fill>

                <Stroke>
                  <CssParameter name="stroke">#404040</CssParameter>
                  <CssParameter name="stroke-width">0.25</CssParameter>
                </Stroke>
              </Mark>
              
              <Size>
                <ogc:Function name="Categorize">
                  <ogc:PropertyName>area_class</ogc:PropertyName>
                  <ogc:Literal>6</ogc:Literal> <!-- Default (Mini-Spielplätze (area_class=0)) -->
                  <ogc:Literal>1</ogc:Literal> <ogc:Literal>18</ogc:Literal> <!-- Kleine Spielplätze (area_class=1) -->
                  <ogc:Literal>2</ogc:Literal> <ogc:Literal>36</ogc:Literal> <!-- Große Spielplätze (area_class=2) -->
                  <ogc:Literal>3</ogc:Literal> <ogc:Literal>54</ogc:Literal> <!-- Riesen-Spielplätze (area_class=3) -->
                </ogc:Function>
              </Size>

            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- Regel für größere Maßstäbe (nah herangezoomt) -->
        <Rule>
          <MaxScaleDenominator>15000</MaxScaleDenominator>
          <PolygonSymbolizer>

            <!-- <Fill>
              <CssParameter name="fill">#ed7014</CssParameter>
            </Fill> -->

            <Fill>
              <CssParameter name="fill">
                <ogc:Function name="if_then_else">
                  <ogc:Function name="equalTo">
                    <ogc:PropertyName>access</ogc:PropertyName>
                    <ogc:Literal>yes</ogc:Literal>
                  </ogc:Function>
                  <ogc:Literal>#ed7014</ogc:Literal>
                  <ogc:Function name="if_then_else">
                    <ogc:Function name="equalTo">
                      <ogc:PropertyName>access</ogc:PropertyName>
                      <ogc:Literal>permissive</ogc:Literal>
                    </ogc:Function>
                    <ogc:Literal>#f9af78</ogc:Literal>
                    <ogc:Function name="if_then_else">
                      <ogc:Function name="isNull">
                        <ogc:PropertyName>access</ogc:PropertyName>
                      </ogc:Function>
                      <ogc:Literal>#f9af78</ogc:Literal>
                      <ogc:Literal>#f69cc3</ogc:Literal>
                    </ogc:Function>
                  </ogc:Function>
                </ogc:Function>
              </CssParameter>
            </Fill>

            <Stroke>
              <CssParameter name="stroke">#808080</CssParameter>
              <CssParameter name="stroke-width">0.025</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>

        <VendorOption name="sortBy">area_class D</VendorOption>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>