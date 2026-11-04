// SPDX-License-Identifier: MIT
// Extracted fixed Three0.186.1 parse method; see SOURCE.json. No browser/Canvas/mesh renderer.
import {Color,Matrix3,Path,ShapePath,SRGBColorSpace,Vector2,Vector3} from 'three';
const COLOR_SPACE_SVG=SRGBColorSpace;
export function parseSvgDocument(xml,warning) {

		const scope = {defaultDPI:96,defaultUnit:'px'};

		function parseNode( node, style ) {

			if ( node.nodeType !== 1 ) return;

			if ( node.hasAttribute( 'filter' ) ) {

				warning( 'THREE.SVGLoader: Filters are not supported.' );

			}

			const transform = getNodeTransform( node );

			let isDefsNode = false;

			let path = null;

			switch ( node.nodeName ) {

				case 'svg':
					style = parseStyle( node, style );
					break;

				case 'style':
					parseCSSStylesheet( node );
					break;

				case 'g':
					style = parseStyle( node, style );
					break;

				case 'path':
					style = parseStyle( node, style );
					if ( node.hasAttribute( 'd' ) ) path = parsePathNode( node );
					break;

				case 'rect':
					style = parseStyle( node, style );
					path = parseRectNode( node );
					break;

				case 'polygon':
					style = parseStyle( node, style );
					path = parsePolygonNode( node );
					break;

				case 'polyline':
					style = parseStyle( node, style );
					path = parsePolylineNode( node );
					break;

				case 'circle':
					style = parseStyle( node, style );
					path = parseCircleNode( node );
					break;

				case 'ellipse':
					style = parseStyle( node, style );
					path = parseEllipseNode( node );
					break;

				case 'line':
					style = parseStyle( node, style );
					path = parseLineNode( node );
					break;

				case 'defs':
					isDefsNode = true;
					break;

				case 'use':
					style = parseStyle( node, style );

					const href = node.getAttributeNS( 'http://www.w3.org/1999/xlink', 'href' ) || '';
					const usedNodeId = href.substring( 1 );
					const usedNode = node.viewportElement.getElementById( usedNodeId );
					if ( usedNode ) {

						parseNode( usedNode, style );

					} else {

						warning( 'SVGLoader: \'use node\' references non-existent node id: ' + usedNodeId );

					}

					break;

				default:
					// console.log( node );

			}

			if ( path ) {

				if ( style.fill !== undefined && style.fill !== 'none' && ! style.fill.startsWith( 'url' ) ) {

					path.color.setStyle( style.fill, COLOR_SPACE_SVG );

				}

				transformPath( path, currentTransform );

				paths.push( path );

				const pathStyle = Object.assign( {}, style );
				pathStyle.strokeWidth = style.strokeWidth * getTransformScale( currentTransform );

				path.userData = { node: node, style: pathStyle, transform: currentTransform.clone(), gradients: gradients };

			}

			const childNodes = node.childNodes;

			for ( let i = 0; i < childNodes.length; i ++ ) {

				const node = childNodes[ i ];

				if ( isDefsNode && node.nodeName !== 'style' && node.nodeName !== 'defs' ) {

					// Ignore everything in defs except CSS style definitions
					// and nested defs, because it is OK by the standard to have
					// <style/> there.
					continue;

				}

				parseNode( node, style );

			}


			if ( transform ) {

				transformStack.pop();

				if ( transformStack.length > 0 ) {

					currentTransform.copy( transformStack[ transformStack.length - 1 ] );

				} else {

					currentTransform.identity();

				}

			}

		}

		function parsePathNode( node ) {

			const path = new ShapePath();

			const point = new Vector2();
			const control = new Vector2();

			const firstPoint = new Vector2();
			let isFirstPoint = true;
			let doSetFirstPoint = false;

			const d = node.getAttribute( 'd' );

			if ( d === '' || d === 'none' ) return null;

			// console.log( d );

			const commands = d.match( /[a-df-z][^a-df-z]*/ig );

			for ( let i = 0, l = commands.length; i < l; i ++ ) {

				const command = commands[ i ];

				const type = command.charAt( 0 );
				const data = command.slice( 1 ).trim();

				if ( isFirstPoint === true ) {

					doSetFirstPoint = true;
					isFirstPoint = false;

				}

				let numbers;

				switch ( type ) {

					case 'M':
						numbers = parseFloats( data );
						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;

							if ( j === 0 ) {

								path.moveTo( point.x, point.y );

							} else {

								path.lineTo( point.x, point.y );

							}

							if ( j === 0 ) firstPoint.copy( point );

						}

						break;

					case 'H':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.x = numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'V':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.y = numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'L':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'C':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 6 ) {

							path.bezierCurveTo(
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ],
								numbers[ j + 4 ],
								numbers[ j + 5 ]
							);
							control.x = numbers[ j + 2 ];
							control.y = numbers[ j + 3 ];
							point.x = numbers[ j + 4 ];
							point.y = numbers[ j + 5 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'S':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.bezierCurveTo(
								getReflection( point.x, control.x ),
								getReflection( point.y, control.y ),
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ]
							);
							control.x = numbers[ j + 0 ];
							control.y = numbers[ j + 1 ];
							point.x = numbers[ j + 2 ];
							point.y = numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'Q':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.quadraticCurveTo(
								numbers[ j + 0 ],
								numbers[ j + 1 ],
								numbers[ j + 2 ],
								numbers[ j + 3 ]
							);
							control.x = numbers[ j + 0 ];
							control.y = numbers[ j + 1 ];
							point.x = numbers[ j + 2 ];
							point.y = numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'T':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							const rx = getReflection( point.x, control.x );
							const ry = getReflection( point.y, control.y );
							path.quadraticCurveTo(
								rx,
								ry,
								numbers[ j + 0 ],
								numbers[ j + 1 ]
							);
							control.x = rx;
							control.y = ry;
							point.x = numbers[ j + 0 ];
							point.y = numbers[ j + 1 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'A':
						numbers = parseFloats( data, [ 3, 4 ], 7 );

						for ( let j = 0, jl = numbers.length; j < jl; j += 7 ) {

							// skip command if start point == end point
							if ( numbers[ j + 5 ] == point.x && numbers[ j + 6 ] == point.y ) continue;

							const start = point.clone();
							point.x = numbers[ j + 5 ];
							point.y = numbers[ j + 6 ];
							control.x = point.x;
							control.y = point.y;
							parseArcCommand(
								path, numbers[ j ], numbers[ j + 1 ], numbers[ j + 2 ], numbers[ j + 3 ], numbers[ j + 4 ], start, point
							);

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'm':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x += numbers[ j + 0 ];
							point.y += numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;

							if ( j === 0 ) {

								path.moveTo( point.x, point.y );

							} else {

								path.lineTo( point.x, point.y );

							}

							if ( j === 0 ) firstPoint.copy( point );

						}

						break;

					case 'h':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.x += numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'v':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j ++ ) {

							point.y += numbers[ j ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'l':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							point.x += numbers[ j + 0 ];
							point.y += numbers[ j + 1 ];
							control.x = point.x;
							control.y = point.y;
							path.lineTo( point.x, point.y );

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'c':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 6 ) {

							path.bezierCurveTo(
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ],
								point.x + numbers[ j + 4 ],
								point.y + numbers[ j + 5 ]
							);
							control.x = point.x + numbers[ j + 2 ];
							control.y = point.y + numbers[ j + 3 ];
							point.x += numbers[ j + 4 ];
							point.y += numbers[ j + 5 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 's':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.bezierCurveTo(
								getReflection( point.x, control.x ),
								getReflection( point.y, control.y ),
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ]
							);
							control.x = point.x + numbers[ j + 0 ];
							control.y = point.y + numbers[ j + 1 ];
							point.x += numbers[ j + 2 ];
							point.y += numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'q':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 4 ) {

							path.quadraticCurveTo(
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ],
								point.x + numbers[ j + 2 ],
								point.y + numbers[ j + 3 ]
							);
							control.x = point.x + numbers[ j + 0 ];
							control.y = point.y + numbers[ j + 1 ];
							point.x += numbers[ j + 2 ];
							point.y += numbers[ j + 3 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 't':
						numbers = parseFloats( data );

						for ( let j = 0, jl = numbers.length; j < jl; j += 2 ) {

							const rx = getReflection( point.x, control.x );
							const ry = getReflection( point.y, control.y );
							path.quadraticCurveTo(
								rx,
								ry,
								point.x + numbers[ j + 0 ],
								point.y + numbers[ j + 1 ]
							);
							control.x = rx;
							control.y = ry;
							point.x = point.x + numbers[ j + 0 ];
							point.y = point.y + numbers[ j + 1 ];

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'a':
						numbers = parseFloats( data, [ 3, 4 ], 7 );

						for ( let j = 0, jl = numbers.length; j < jl; j += 7 ) {

							// skip command if no displacement
							if ( numbers[ j + 5 ] == 0 && numbers[ j + 6 ] == 0 ) continue;

							const start = point.clone();
							point.x += numbers[ j + 5 ];
							point.y += numbers[ j + 6 ];
							control.x = point.x;
							control.y = point.y;
							parseArcCommand(
								path, numbers[ j ], numbers[ j + 1 ], numbers[ j + 2 ], numbers[ j + 3 ], numbers[ j + 4 ], start, point
							);

							if ( j === 0 && doSetFirstPoint === true ) firstPoint.copy( point );

						}

						break;

					case 'Z':
					case 'z':
						path.currentPath.autoClose = true;

						if ( path.currentPath.curves.length > 0 ) {

							// Reset point to beginning of Path
							point.copy( firstPoint );
							path.currentPath.currentPoint.copy( point );
							isFirstPoint = true;

						}

						break;

					default:
						warning( command );

				}

				// console.log( type, parseFloats( data ), parseFloats( data ).length  )

				doSetFirstPoint = false;

			}

			return path;

		}

		function parseCSSStylesheet( node ) {

			if ( ! node.sheet || ! node.sheet.cssRules || ! node.sheet.cssRules.length ) return;

			for ( let i = 0; i < node.sheet.cssRules.length; i ++ ) {

				const stylesheet = node.sheet.cssRules[ i ];

				if ( stylesheet.type !== 1 ) continue;

				const selectorList = stylesheet.selectorText
					.split( /,/gm )
					.filter( Boolean )
					.map( i => i.trim() );

				for ( let j = 0; j < selectorList.length; j ++ ) {

					// Remove empty rules
					const definitions = Object.fromEntries(
						Object.entries( stylesheet.style ).filter( ( [ , v ] ) => v !== '' )
					);

					stylesheets[ selectorList[ j ] ] = Object.assign(
						stylesheets[ selectorList[ j ] ] || {},
						definitions
					);

				}

			}

		}

		/**
		 * https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
		 * https://mortoray.com/2017/02/16/rendering-an-svg-elliptical-arc-as-bezier-curves/ Appendix: Endpoint to center arc conversion
		 * From
		 * rx ry x-axis-rotation large-arc-flag sweep-flag x y
		 * To
		 * aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation
		 */

		function parseArcCommand( path, rx, ry, x_axis_rotation, large_arc_flag, sweep_flag, start, end ) {

			if ( rx == 0 || ry == 0 ) {

				// draw a line if either of the radii == 0
				path.lineTo( end.x, end.y );
				return;

			}

			x_axis_rotation = x_axis_rotation * Math.PI / 180;

			// Ensure radii are positive
			rx = Math.abs( rx );
			ry = Math.abs( ry );

			// Compute (x1', y1')
			const dx2 = ( start.x - end.x ) / 2.0;
			const dy2 = ( start.y - end.y ) / 2.0;
			const x1p = Math.cos( x_axis_rotation ) * dx2 + Math.sin( x_axis_rotation ) * dy2;
			const y1p = - Math.sin( x_axis_rotation ) * dx2 + Math.cos( x_axis_rotation ) * dy2;

			// Compute (cx', cy')
			let rxs = rx * rx;
			let rys = ry * ry;
			const x1ps = x1p * x1p;
			const y1ps = y1p * y1p;

			// Ensure radii are large enough
			const cr = x1ps / rxs + y1ps / rys;

			if ( cr > 1 ) {

				// scale up rx,ry equally so cr == 1
				const s = Math.sqrt( cr );
				rx = s * rx;
				ry = s * ry;
				rxs = rx * rx;
				rys = ry * ry;

			}

			const dq = ( rxs * y1ps + rys * x1ps );
			const pq = ( rxs * rys - dq ) / dq;
			let q = Math.sqrt( Math.max( 0, pq ) );
			if ( large_arc_flag === sweep_flag ) q = - q;
			const cxp = q * rx * y1p / ry;
			const cyp = - q * ry * x1p / rx;

			// Step 3: Compute (cx, cy) from (cx', cy')
			const cx = Math.cos( x_axis_rotation ) * cxp - Math.sin( x_axis_rotation ) * cyp + ( start.x + end.x ) / 2;
			const cy = Math.sin( x_axis_rotation ) * cxp + Math.cos( x_axis_rotation ) * cyp + ( start.y + end.y ) / 2;

			// Step 4: Compute θ1 and Δθ
			const theta = svgAngle( 1, 0, ( x1p - cxp ) / rx, ( y1p - cyp ) / ry );
			const delta = svgAngle( ( x1p - cxp ) / rx, ( y1p - cyp ) / ry, ( - x1p - cxp ) / rx, ( - y1p - cyp ) / ry ) % ( Math.PI * 2 );

			path.currentPath.absellipse( cx, cy, rx, ry, theta, theta + delta, sweep_flag === 0, x_axis_rotation );

		}

		function svgAngle( ux, uy, vx, vy ) {

			const dot = ux * vx + uy * vy;
			const len = Math.sqrt( ux * ux + uy * uy ) * Math.sqrt( vx * vx + vy * vy );
			let ang = Math.acos( Math.max( - 1, Math.min( 1, dot / len ) ) ); // floating point precision, slightly over values appear
			if ( ( ux * vy - uy * vx ) < 0 ) ang = - ang;
			return ang;

		}

		/*
		* According to https://www.w3.org/TR/SVG/shapes.html#RectElementRXAttribute
		* rounded corner should be rendered to elliptical arc, but bezier curve does the job well enough
		*/

		function parseRectNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'x' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'y' ) || 0 );
			const rx = parseFloatWithUnits( node.getAttribute( 'rx' ) || node.getAttribute( 'ry' ) || 0 );
			const ry = parseFloatWithUnits( node.getAttribute( 'ry' ) || node.getAttribute( 'rx' ) || 0 );
			const w = parseFloatWithUnits( node.getAttribute( 'width' ) );
			const h = parseFloatWithUnits( node.getAttribute( 'height' ) );

			// Ellipse arc to Bezier approximation Coefficient (Inversed). See:
			// https://spencermortensen.com/articles/bezier-circle/
			const bci = 1 - 0.551915024494;

			const path = new ShapePath();

			// top left
			path.moveTo( x + rx, y );

			// top right
			path.lineTo( x + w - rx, y );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + w - rx * bci,
					y,
					x + w,
					y + ry * bci,
					x + w,
					y + ry
				);

			}

			// bottom right
			path.lineTo( x + w, y + h - ry );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + w,
					y + h - ry * bci,
					x + w - rx * bci,
					y + h,
					x + w - rx,
					y + h
				);

			}

			// bottom left
			path.lineTo( x + rx, y + h );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo(
					x + rx * bci,
					y + h,
					x,
					y + h - ry * bci,
					x,
					y + h - ry
				);

			}

			// back to top left
			path.lineTo( x, y + ry );
			if ( rx !== 0 || ry !== 0 ) {

				path.bezierCurveTo( x, y + ry * bci, x + rx * bci, y, x + rx, y );

			}

			return path;

		}

		function parsePolygonNode( node ) {

			function iterator( match, a, b ) {

				const x = parseFloatWithUnits( a );
				const y = parseFloatWithUnits( b );

				if ( index === 0 ) {

					path.moveTo( x, y );

				} else {

					path.lineTo( x, y );

				}

				index ++;

			}

			const regex = /([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(?:,|\s)([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/g;

			const path = new ShapePath();

			let index = 0;

			node.getAttribute( 'points' ).replace( regex, iterator );

			path.currentPath.autoClose = true;

			return path;

		}

		function parsePolylineNode( node ) {

			function iterator( match, a, b ) {

				const x = parseFloatWithUnits( a );
				const y = parseFloatWithUnits( b );

				if ( index === 0 ) {

					path.moveTo( x, y );

				} else {

					path.lineTo( x, y );

				}

				index ++;

			}

			const regex = /([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(?:,|\s)([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/g;

			const path = new ShapePath();

			let index = 0;

			node.getAttribute( 'points' ).replace( regex, iterator );

			path.currentPath.autoClose = false;

			return path;

		}

		function parseCircleNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'cx' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'cy' ) || 0 );
			const r = parseFloatWithUnits( node.getAttribute( 'r' ) || 0 );

			const subpath = new Path();
			subpath.absarc( x, y, r, 0, Math.PI * 2 );

			const path = new ShapePath();
			path.subPaths.push( subpath );

			return path;

		}

		function parseEllipseNode( node ) {

			const x = parseFloatWithUnits( node.getAttribute( 'cx' ) || 0 );
			const y = parseFloatWithUnits( node.getAttribute( 'cy' ) || 0 );
			const rx = parseFloatWithUnits( node.getAttribute( 'rx' ) || 0 );
			const ry = parseFloatWithUnits( node.getAttribute( 'ry' ) || 0 );

			const subpath = new Path();
			subpath.absellipse( x, y, rx, ry, 0, Math.PI * 2 );

			const path = new ShapePath();
			path.subPaths.push( subpath );

			return path;

		}

		function parseLineNode( node ) {

			const x1 = parseFloatWithUnits( node.getAttribute( 'x1' ) || 0 );
			const y1 = parseFloatWithUnits( node.getAttribute( 'y1' ) || 0 );
			const x2 = parseFloatWithUnits( node.getAttribute( 'x2' ) || 0 );
			const y2 = parseFloatWithUnits( node.getAttribute( 'y2' ) || 0 );

			const path = new ShapePath();
			path.moveTo( x1, y1 );
			path.lineTo( x2, y2 );
			path.currentPath.autoClose = false;

			return path;

		}

		//

		function parseGradients( xml ) {

			const HREF_NS = 'http://www.w3.org/1999/xlink';
			const gradientNodes = [...Array.from(xml.getElementsByTagName('linearGradient')),...Array.from(xml.getElementsByTagName('radialGradient'))];
			const ATTRS = [ 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform', 'spreadMethod' ];

			const parsed = Object.create(null);

			for ( const node of gradientNodes ) {

				const id = node.getAttribute( 'id' );
				if ( ! id ) continue;

				const entry = {
					type: node.nodeName === 'radialGradient' ? 'radialGradient' : 'linearGradient',
					attrs: {},
					stops: null,
					href: null,
				};

				const href = node.getAttributeNS( HREF_NS, 'href' ) || node.getAttribute( 'href' ) || '';
				if ( href.startsWith( '#' ) ) entry.href = href.substring( 1 );

				for ( const name of ATTRS ) {

					if ( node.hasAttribute( name ) ) entry.attrs[ name ] = node.getAttribute( name );

				}

				const stopNodes = Array.from(node.getElementsByTagName('stop'));
				if ( stopNodes.length > 0 ) {

					entry.stops = [];
					for ( const s of stopNodes ) {

						let color = s.getAttribute( 'stop-color' );
						if ( ! color && s.style ) color = s.style[ 'stop-color' ];
						if ( ! color ) color = '#000';

						let opacity = s.getAttribute( 'stop-opacity' );
						if ( ( opacity === null || opacity === '' ) && s.style ) opacity = s.style[ 'stop-opacity' ];
						opacity = ( opacity === null || opacity === '' || opacity === undefined )
							? 1
							: Math.max( 0, Math.min( 1, parseFloat( opacity ) ) );

						const offset = Math.max( 0, Math.min( 1, parseFloat( s.getAttribute( 'offset' ) || '0' ) ) );
						entry.stops.push( { offset, color, opacity } );

					}

				}

				parsed[ id ] = entry;

			}

			function inherit( id, visited ) {

				const entry = parsed[ id ];
				if ( ! entry || visited.has( id ) ) return entry;
				visited.add( id );

				if ( entry.href && parsed[ entry.href ] ) {

					const parent = inherit( entry.href, visited );
					if ( parent ) {

						if ( ! entry.stops ) entry.stops = parent.stops;
						for ( const key in parent.attrs ) {

							if ( ! ( key in entry.attrs ) ) entry.attrs[ key ] = parent.attrs[ key ];

						}

					}

				}

				return entry;

			}

			for ( const id in parsed ) inherit( id, new Set() );

			for ( const id in parsed ) {

				const entry = parsed[ id ];
				const a = entry.attrs;
				const units = a.gradientUnits === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox';

				const gradient = {
					type: entry.type,
					gradientUnits: units,
					spreadMethod: a.spreadMethod === 'reflect' || a.spreadMethod === 'repeat' ? a.spreadMethod : 'pad',
					gradientTransform: null,
					stops: ( entry.stops || [] ).slice().sort( ( x, y ) => x.offset - y.offset ),
				};

				if ( a.gradientTransform ) {

					gradient.gradientTransform = new Matrix3();
					parseTransformString( a.gradientTransform, gradient.gradientTransform );

				}

				function coord( str ) {

					if ( typeof str !== 'string' ) return 0;
					if ( str.endsWith( '%' ) ) return parseFloat( str ) / 100;
					return parseFloatWithUnits( str );

				}

				if ( entry.type === 'linearGradient' ) {

					gradient.x1 = a.x1 !== undefined ? coord( a.x1 ) : 0;
					gradient.y1 = a.y1 !== undefined ? coord( a.y1 ) : 0;
					gradient.x2 = a.x2 !== undefined ? coord( a.x2 ) : ( units === 'objectBoundingBox' ? 1 : 0 );
					gradient.y2 = a.y2 !== undefined ? coord( a.y2 ) : 0;

				} else {

					const defCenter = units === 'objectBoundingBox' ? 0.5 : 0;
					const defR = units === 'objectBoundingBox' ? 0.5 : 0;
					gradient.cx = a.cx !== undefined ? coord( a.cx ) : defCenter;
					gradient.cy = a.cy !== undefined ? coord( a.cy ) : defCenter;
					gradient.r = a.r !== undefined ? coord( a.r ) : defR;
					gradient.fx = a.fx !== undefined ? coord( a.fx ) : gradient.cx;
					gradient.fy = a.fy !== undefined ? coord( a.fy ) : gradient.cy;

				}

				gradients[ id ] = gradient;

			}

		}

		//

		function parseStyle( node, style ) {

			style = Object.assign( {}, style ); // clone style

			let stylesheetStyles = {};

			if ( node.hasAttribute( 'class' ) ) {

				const classSelectors = node.getAttribute( 'class' )
					.split( /\s/ )
					.filter( Boolean )
					.map( i => i.trim() );

				for ( let i = 0; i < classSelectors.length; i ++ ) {

					stylesheetStyles = Object.assign( stylesheetStyles, stylesheets[ '.' + classSelectors[ i ] ] );

				}

			}

			if ( node.hasAttribute( 'id' ) ) {

				stylesheetStyles = Object.assign( stylesheetStyles, stylesheets[ '#' + node.getAttribute( 'id' ) ] );

			}

			function addStyle( svgName, jsName, adjustFunction ) {

				if ( adjustFunction === undefined ) adjustFunction = function copy( v ) {

					return v;

				};

				if ( node.hasAttribute( svgName ) ) style[ jsName ] = adjustFunction( node.getAttribute( svgName ) );
				if ( stylesheetStyles[ jsName ] ) style[ jsName ] = adjustFunction( stylesheetStyles[ jsName ] );
				if ( node.style && node.style[ svgName ] !== '' ) style[ jsName ] = adjustFunction( node.style[ svgName ] );

			}

			function clamp( v ) {

				return Math.max( 0, Math.min( 1, parseFloatWithUnits( v ) ) );

			}

			function positive( v ) {

				return Math.max( 0, parseFloatWithUnits( v ) );

			}

			addStyle( 'fill', 'fill' );
			addStyle( 'fill-opacity', 'fillOpacity', clamp );
			addStyle( 'fill-rule', 'fillRule' );
			addStyle( 'opacity', 'opacity', clamp );
			addStyle( 'stroke', 'stroke' );
			addStyle( 'stroke-opacity', 'strokeOpacity', clamp );
			addStyle( 'stroke-width', 'strokeWidth', positive );
			addStyle( 'stroke-linejoin', 'strokeLineJoin' );
			addStyle( 'stroke-linecap', 'strokeLineCap' );
			addStyle( 'stroke-miterlimit', 'strokeMiterLimit', positive );
			addStyle( 'visibility', 'visibility' );

			return style;

		}

		// http://www.w3.org/TR/SVG11/implnote.html#PathElementImplementationNotes

		function getReflection( a, b ) {

			return a - ( b - a );

		}

		// from https://github.com/ppvg/svg-numbers (MIT License)

		function parseFloats( input, flags, stride ) {

			if ( typeof input !== 'string' ) {

				throw new TypeError( 'Invalid input: ' + typeof input );

			}

			// Character groups
			const RE = {
				SEPARATOR: /[ \t\r\n\,.\-+]/,
				WHITESPACE: /[ \t\r\n]/,
				DIGIT: /[\d]/,
				SIGN: /[-+]/,
				POINT: /\./,
				COMMA: /,/,
				EXP: /e/i,
				FLAGS: /[01]/
			};

			// States
			const SEP = 0;
			const INT = 1;
			const FLOAT = 2;
			const EXP = 3;

			let state = SEP;
			let seenComma = true;
			let number = '', exponent = '';
			const result = [];

			function throwSyntaxError( current, i, partial ) {

				const error = new SyntaxError( 'Unexpected character "' + current + '" at index ' + i + '.' );
				error.partial = partial;
				throw error;

			}

			function newNumber() {

				if ( number !== '' ) {

					if ( exponent === '' ) result.push( Number( number ) );
					else result.push( Number( number ) * Math.pow( 10, Number( exponent ) ) );

				}

				number = '';
				exponent = '';

			}

			let current;
			const length = input.length;

			for ( let i = 0; i < length; i ++ ) {

				current = input[ i ];

				// check for flags
				if ( Array.isArray( flags ) && flags.includes( result.length % stride ) && RE.FLAGS.test( current ) ) {

					state = INT;
					number = current;
					newNumber();
					continue;

				}

				// parse until next number
				if ( state === SEP ) {

					// eat whitespace
					if ( RE.WHITESPACE.test( current ) ) {

						continue;

					}

					// start new number
					if ( RE.DIGIT.test( current ) || RE.SIGN.test( current ) ) {

						state = INT;
						number = current;
						continue;

					}

					if ( RE.POINT.test( current ) ) {

						state = FLOAT;
						number = current;
						continue;

					}

					// throw on double commas (e.g. "1, , 2")
					if ( RE.COMMA.test( current ) ) {

						if ( seenComma ) {

							throwSyntaxError( current, i, result );

						}

						seenComma = true;

					}

				}

				// parse integer part
				if ( state === INT ) {

					if ( RE.DIGIT.test( current ) ) {

						number += current;
						continue;

					}

					if ( RE.POINT.test( current ) ) {

						number += current;
						state = FLOAT;
						continue;

					}

					if ( RE.EXP.test( current ) ) {

						state = EXP;
						continue;

					}

					// throw on double signs ("-+1"), but not on sign as separator ("-1-2")
					if ( RE.SIGN.test( current )
							&& number.length === 1
							&& RE.SIGN.test( number[ 0 ] ) ) {

						throwSyntaxError( current, i, result );

					}

				}

				// parse decimal part
				if ( state === FLOAT ) {

					if ( RE.DIGIT.test( current ) ) {

						number += current;
						continue;

					}

					if ( RE.EXP.test( current ) ) {

						state = EXP;
						continue;

					}

					// throw on double decimal points (e.g. "1..2")
					if ( RE.POINT.test( current ) && number[ number.length - 1 ] === '.' ) {

						throwSyntaxError( current, i, result );

					}

				}

				// parse exponent part
				if ( state === EXP ) {

					if ( RE.DIGIT.test( current ) ) {

						exponent += current;
						continue;

					}

					if ( RE.SIGN.test( current ) ) {

						if ( exponent === '' ) {

							exponent += current;
							continue;

						}

						if ( exponent.length === 1 && RE.SIGN.test( exponent ) ) {

							throwSyntaxError( current, i, result );

						}

					}

				}


				// end of number
				if ( RE.WHITESPACE.test( current ) ) {

					newNumber();
					state = SEP;
					seenComma = false;

				} else if ( RE.COMMA.test( current ) ) {

					newNumber();
					state = SEP;
					seenComma = true;

				} else if ( RE.SIGN.test( current ) ) {

					newNumber();
					state = INT;
					number = current;

				} else if ( RE.POINT.test( current ) ) {

					newNumber();
					state = FLOAT;
					number = current;

				} else {

					throwSyntaxError( current, i, result );

				}

			}

			// add the last number found (if any)
			newNumber();

			return result;

		}

		// Units

		const units = [ 'mm', 'cm', 'in', 'pt', 'pc', 'px' ];

		// Conversion: [ fromUnit ][ toUnit ] (-1 means dpi dependent)
		const unitConversion = {

			'mm': {
				'mm': 1,
				'cm': 0.1,
				'in': 1 / 25.4,
				'pt': 72 / 25.4,
				'pc': 6 / 25.4,
				'px': - 1
			},
			'cm': {
				'mm': 10,
				'cm': 1,
				'in': 1 / 2.54,
				'pt': 72 / 2.54,
				'pc': 6 / 2.54,
				'px': - 1
			},
			'in': {
				'mm': 25.4,
				'cm': 2.54,
				'in': 1,
				'pt': 72,
				'pc': 6,
				'px': - 1
			},
			'pt': {
				'mm': 25.4 / 72,
				'cm': 2.54 / 72,
				'in': 1 / 72,
				'pt': 1,
				'pc': 6 / 72,
				'px': - 1
			},
			'pc': {
				'mm': 25.4 / 6,
				'cm': 2.54 / 6,
				'in': 1 / 6,
				'pt': 72 / 6,
				'pc': 1,
				'px': - 1
			},
			'px': {
				'px': 1
			}

		};

		function parseFloatWithUnits( string ) {

			let theUnit = 'px';

			if ( typeof string === 'string' || string instanceof String ) {

				for ( let i = 0, n = units.length; i < n; i ++ ) {

					const u = units[ i ];

					if ( string.endsWith( u ) ) {

						theUnit = u;
						string = string.substring( 0, string.length - u.length );
						break;

					}

				}

			}

			let scale = undefined;

			if ( theUnit === 'px' && scope.defaultUnit !== 'px' ) {

				// Conversion scale from  pixels to inches, then to default units

				scale = unitConversion[ 'in' ][ scope.defaultUnit ] / scope.defaultDPI;

			} else {

				scale = unitConversion[ theUnit ][ scope.defaultUnit ];

				if ( scale < 0 ) {

					// Conversion scale to pixels

					scale = unitConversion[ theUnit ][ 'in' ] * scope.defaultDPI;

				}

			}

			return scale * parseFloat( string );

		}

		// Transforms

		function getNodeTransform( node ) {

			if ( ! ( node.hasAttribute( 'transform' ) || ( node.nodeName === 'use' && ( node.hasAttribute( 'x' ) || node.hasAttribute( 'y' ) ) ) ) ) {

				return null;

			}

			const transform = parseNodeTransform( node );

			if ( transformStack.length > 0 ) {

				transform.premultiply( transformStack[ transformStack.length - 1 ] );

			}

			currentTransform.copy( transform );
			transformStack.push( transform );

			return transform;

		}

		function parseNodeTransform( node ) {

			const transform = new Matrix3();

			if ( node.nodeName === 'use' && ( node.hasAttribute( 'x' ) || node.hasAttribute( 'y' ) ) ) {

				const tx = parseFloatWithUnits( node.getAttribute( 'x' ) || 0 );
				const ty = parseFloatWithUnits( node.getAttribute( 'y' ) || 0 );

				transform.makeTranslation( tx, ty );

			}

			if ( node.hasAttribute( 'transform' ) ) {

				parseTransformString( node.getAttribute( 'transform' ), transform );

			}

			return transform;

		}

		function parseTransformString( text, transform ) {

			const currentTransform = tempTransform0;

			const transformsTexts = text.split( ')' );

			for ( let tIndex = transformsTexts.length - 1; tIndex >= 0; tIndex -- ) {

				const transformText = transformsTexts[ tIndex ].trim();

				if ( transformText === '' ) continue;

				const openParPos = transformText.indexOf( '(' );
				const closeParPos = transformText.length;

				if ( openParPos > 0 && openParPos < closeParPos ) {

					const transformType = transformText.slice( 0, openParPos );

					const array = parseFloats( transformText.slice( openParPos + 1 ) );

					currentTransform.identity();

					switch ( transformType ) {

						case 'translate':

							if ( array.length >= 1 ) {

								const tx = array[ 0 ];
								let ty = 0;

								if ( array.length >= 2 ) {

									ty = array[ 1 ];

								}

								currentTransform.makeTranslation( tx, ty );

							}

							break;

						case 'rotate':

							if ( array.length >= 1 ) {

								let angle = 0;
								let cx = 0;
								let cy = 0;

								// Angle
								angle = array[ 0 ] * Math.PI / 180;

								if ( array.length >= 3 ) {

									// Center x, y
									cx = array[ 1 ];
									cy = array[ 2 ];

								}

								// Rotate around center (cx, cy)
								tempTransform1.makeTranslation( - cx, - cy );
								tempTransform2.makeRotation( angle );
								tempTransform3.multiplyMatrices( tempTransform2, tempTransform1 );
								tempTransform1.makeTranslation( cx, cy );
								currentTransform.multiplyMatrices( tempTransform1, tempTransform3 );

							}

							break;

						case 'scale':

							if ( array.length >= 1 ) {

								const scaleX = array[ 0 ];
								let scaleY = scaleX;

								if ( array.length >= 2 ) {

									scaleY = array[ 1 ];

								}

								currentTransform.makeScale( scaleX, scaleY );

							}

							break;

						case 'skewX':

							if ( array.length === 1 ) {

								currentTransform.set(
									1, Math.tan( array[ 0 ] * Math.PI / 180 ), 0,
									0, 1, 0,
									0, 0, 1
								);

							}

							break;

						case 'skewY':

							if ( array.length === 1 ) {

								currentTransform.set(
									1, 0, 0,
									Math.tan( array[ 0 ] * Math.PI / 180 ), 1, 0,
									0, 0, 1
								);

							}

							break;

						case 'matrix':

							if ( array.length === 6 ) {

								currentTransform.set(
									array[ 0 ], array[ 2 ], array[ 4 ],
									array[ 1 ], array[ 3 ], array[ 5 ],
									0, 0, 1
								);

							}

							break;

					}

					transform.premultiply( currentTransform );

				}

			}

			return transform;

		}

		function transformPath( path, m ) {

			function transfVec2( v2 ) {

				tempV3.set( v2.x, v2.y, 1 ).applyMatrix3( m );

				v2.set( tempV3.x, tempV3.y );

			}

			function transfEllipseGeneric( curve ) {

				// For math description see:
				// https://math.stackexchange.com/questions/4544164

				const a = curve.xRadius;
				const b = curve.yRadius;

				const cosTheta = Math.cos( curve.aRotation );
				const sinTheta = Math.sin( curve.aRotation );

				const v1 = new Vector3( a * cosTheta, a * sinTheta, 0 );
				const v2 = new Vector3( - b * sinTheta, b * cosTheta, 0 );

				const f1 = v1.applyMatrix3( m );
				const f2 = v2.applyMatrix3( m );

				const mF = tempTransform0.set(
					f1.x, f2.x, 0,
					f1.y, f2.y, 0,
					0, 0, 1,
				);

				const mFInv = tempTransform1.copy( mF ).invert();
				const mFInvT = tempTransform2.copy( mFInv ).transpose();
				const mQ = mFInvT.multiply( mFInv );
				const mQe = mQ.elements;

				const ed = eigenDecomposition( mQe[ 0 ], mQe[ 1 ], mQe[ 4 ] );
				const rt1sqrt = Math.sqrt( ed.rt1 );
				const rt2sqrt = Math.sqrt( ed.rt2 );

				curve.xRadius = 1 / rt1sqrt;
				curve.yRadius = 1 / rt2sqrt;
				curve.aRotation = Math.atan2( ed.sn, ed.cs );

				const isFullEllipse =
					( curve.aEndAngle - curve.aStartAngle ) % ( 2 * Math.PI ) < Number.EPSILON;

				// Do not touch angles of a full ellipse because after transformation they
				// would converge to a single value effectively removing the whole curve

				if ( ! isFullEllipse ) {

					const mDsqrt = tempTransform1.set(
						rt1sqrt, 0, 0,
						0, rt2sqrt, 0,
						0, 0, 1,
					);

					const mRT = tempTransform2.set(
						ed.cs, ed.sn, 0,
						- ed.sn, ed.cs, 0,
						0, 0, 1,
					);

					const mDRF = mDsqrt.multiply( mRT ).multiply( mF );

					const transformAngle = phi => {

						const { x: cosR, y: sinR } =
							new Vector3( Math.cos( phi ), Math.sin( phi ), 0 ).applyMatrix3( mDRF );

						return Math.atan2( sinR, cosR );

					};

					curve.aStartAngle = transformAngle( curve.aStartAngle );
					curve.aEndAngle = transformAngle( curve.aEndAngle );

					if ( isTransformFlipped( m ) ) {

						curve.aClockwise = ! curve.aClockwise;

					}

				}

			}

			function transfEllipseNoSkew( curve ) {

				// Faster shortcut if no skew is applied
				// (e.g, a euclidean transform of a group containing the ellipse)

				const sx = getTransformScaleX( m );
				const sy = getTransformScaleY( m );

				curve.xRadius *= sx;
				curve.yRadius *= sy;

				// Extract rotation angle from the matrix of form:
				//
				//  | cosθ sx   -sinθ sy |
				//  | sinθ sx    cosθ sy |
				//
				// Remembering that tanθ = sinθ / cosθ; and that
				// `sx`, `sy`, or both might be zero.
				const theta =
					sx > Number.EPSILON
						? Math.atan2( m.elements[ 1 ], m.elements[ 0 ] )
						: Math.atan2( - m.elements[ 3 ], m.elements[ 4 ] );

				curve.aRotation += theta;

				if ( isTransformFlipped( m ) ) {

					curve.aStartAngle *= - 1;
					curve.aEndAngle *= - 1;
					curve.aClockwise = ! curve.aClockwise;

				}

			}

			const subPaths = path.subPaths;

			for ( let i = 0, n = subPaths.length; i < n; i ++ ) {

				const subPath = subPaths[ i ];
				const curves = subPath.curves;

				for ( let j = 0; j < curves.length; j ++ ) {

					const curve = curves[ j ];

					if ( curve.isLineCurve ) {

						transfVec2( curve.v1 );
						transfVec2( curve.v2 );

					} else if ( curve.isCubicBezierCurve ) {

						transfVec2( curve.v0 );
						transfVec2( curve.v1 );
						transfVec2( curve.v2 );
						transfVec2( curve.v3 );

					} else if ( curve.isQuadraticBezierCurve ) {

						transfVec2( curve.v0 );
						transfVec2( curve.v1 );
						transfVec2( curve.v2 );

					} else if ( curve.isEllipseCurve ) {

						// Transform ellipse center point

						tempV2.set( curve.aX, curve.aY );
						transfVec2( tempV2 );
						curve.aX = tempV2.x;
						curve.aY = tempV2.y;

						// Transform ellipse shape parameters

						if ( isTransformSkewed( m ) ) {

							transfEllipseGeneric( curve );

						} else {

							transfEllipseNoSkew( curve );

						}

					}

				}

			}

		}

		function isTransformFlipped( m ) {

			const te = m.elements;
			return te[ 0 ] * te[ 4 ] - te[ 1 ] * te[ 3 ] < 0;

		}

		function isTransformSkewed( m ) {

			const te = m.elements;
			const basisDot = te[ 0 ] * te[ 3 ] + te[ 1 ] * te[ 4 ];

			// Shortcut for trivial rotations and transformations
			if ( basisDot === 0 ) return false;

			const sx = getTransformScaleX( m );
			const sy = getTransformScaleY( m );

			return Math.abs( basisDot / ( sx * sy ) ) > Number.EPSILON;

		}

		function getTransformScaleX( m ) {

			const te = m.elements;
			return Math.sqrt( te[ 0 ] * te[ 0 ] + te[ 1 ] * te[ 1 ] );

		}

		function getTransformScaleY( m ) {

			const te = m.elements;
			return Math.sqrt( te[ 3 ] * te[ 3 ] + te[ 4 ] * te[ 4 ] );

		}

		function getTransformScale( m ) {

			const te = m.elements;
			const det = te[ 0 ] * te[ 4 ] - te[ 1 ] * te[ 3 ];
			return Math.sqrt( Math.abs( det ) );

		}

		// Calculates the eigensystem of a real symmetric 2x2 matrix
		//    [ A  B ]
		//    [ B  C ]
		// in the form
		//    [ A  B ]  =  [ cs  -sn ] [ rt1   0  ] [  cs  sn ]
		//    [ B  C ]     [ sn   cs ] [  0   rt2 ] [ -sn  cs ]
		// where rt1 >= rt2.
		//
		// Adapted from: https://www.mpi-hd.mpg.de/personalhomes/globes/3x3/index.html
		// -> Algorithms for real symmetric matrices -> Analytical (2x2 symmetric)
		function eigenDecomposition( A, B, C ) {

			let rt1, rt2, cs, sn, t;
			const sm = A + C;
			const df = A - C;
			const rt = Math.sqrt( df * df + 4 * B * B );

			if ( sm > 0 ) {

				rt1 = 0.5 * ( sm + rt );
				t = 1 / rt1;
				rt2 = A * t * C - B * t * B;

			} else if ( sm < 0 ) {

				rt2 = 0.5 * ( sm - rt );

			} else {

				// This case needs to be treated separately to avoid div by 0

				rt1 = 0.5 * rt;
				rt2 = - 0.5 * rt;

			}

			// Calculate eigenvectors

			if ( df > 0 ) {

				cs = df + rt;

			} else {

				cs = df - rt;

			}

			if ( Math.abs( cs ) > 2 * Math.abs( B ) ) {

				t = - 2 * B / cs;
				sn = 1 / Math.sqrt( 1 + t * t );
				cs = t * sn;

			} else if ( Math.abs( B ) === 0 ) {

				cs = 1;
				sn = 0;

			} else {

				t = - 0.5 * cs / B;
				cs = 1 / Math.sqrt( 1 + t * t );
				sn = t * cs;

			}

			if ( df > 0 ) {

				t = cs;
				cs = - sn;
				sn = t;

			}

			return { rt1, rt2, cs, sn };

		}

		//

		const paths = [];
		const stylesheets = {};
		const gradients = Object.create(null);

		const transformStack = [];

		const tempTransform0 = new Matrix3();
		const tempTransform1 = new Matrix3();
		const tempTransform2 = new Matrix3();
		const tempTransform3 = new Matrix3();
		const tempV2 = new Vector2();
		const tempV3 = new Vector3();

		const currentTransform = new Matrix3();

		

		parseGradients( xml );

		
		const data = {gradients,localTransform:node=>parseNodeTransform(node),shape(node){switch(node.nodeName){case'path':return parsePathNode(node);case'rect':return parseRectNode(node);case'circle':return parseCircleNode(node);case'ellipse':return parseEllipseNode(node);case'line':return parseLineNode(node);case'polyline':return parsePolylineNode(node);case'polygon':return parsePolygonNode(node);default:return null;}}};

		// console.log( paths );
		return data;

	}
