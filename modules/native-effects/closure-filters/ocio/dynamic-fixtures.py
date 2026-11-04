"""Official OCIO processors and independent CPU inputs; no rendering fallback."""
import json, os, sys
import PyOpenColorIO as o
from extract import extract

directory = os.path.abspath(sys.argv[1])
os.makedirs(directory, exist_ok=True)
profiles = []
for kind in ['exposure', 'primary', 'curve']:
    variants = []
    for index in range(3):
        if kind == 'exposure':
            transform = o.ExposureContrastTransform(exposure=[0., 1.25, -.75][index], contrast=[1., 1.08, .9][index], gamma=[1., .96, 1.12][index])
            # Config serialization intentionally resets dynamic ExposureContrast
            # values. Persist the explicit defaults as static, then enable the
            # requested properties when extracting the processor.
        elif kind == 'primary':
            value = o.GradingPrimary(o.GRADING_LIN)
            if index != 0:
                value.exposure = o.GradingRGBM(.12 * index, -.05 * index, .08 * index, .15 * index)
                value.offset = o.GradingRGBM(.003 * index, -.002 * index, .001 * index, .004 * index)
                value.contrast = o.GradingRGBM(1.02, .99, 1.04, 1.)
                value.saturation = .94
            transform = o.GradingPrimaryTransform(value, o.GRADING_LIN, True)
        else:
            value = o.GradingRGBCurve(o.GRADING_LIN)
            if index != 0:
                value.red = o.GradingBSplineCurve([0., 0., .18, .18 + .018 * index, 1., 1.])
                value.green = o.GradingBSplineCurve([0., 0., .18, .18 - .012 * index, 1., 1.])
                value.blue = o.GradingBSplineCurve([0., 0., .18, .18 + .009 * index, 1., 1.])
            transform = o.GradingRGBCurveTransform(value, o.GRADING_LIN, True)
        config = o.Config.CreateRaw()
        space = o.ColorSpace(name='linear-709'); space.setIsData(False); config.addColorSpace(space)
        look = o.Look(name='dynamic', processSpace='linear-709'); look.setTransform(transform); config.addLook(look)
        config.addDisplayView('linear-709', 'graded', 'linear-709', 'dynamic')
        path = os.path.join(directory, kind + '-' + str(index) + '.ocio')
        with open(path, 'w', encoding='utf-8') as f: f.write(config.serialize())
        request = dict(operation='look', config=path, source='linear-709', destination='linear-709', look='dynamic', dynamicProperties=[dict(exposure='exposure-contrast', primary='grading-primary', curve='grading-rgb-curve')[kind]])
        metadata = extract(request)
        variants.append(dict(request=request, uniforms=metadata['uniforms']))
    profiles.append(dict(kind=kind, variants=variants))
with open(os.path.join(directory, 'variants-raw.json'), 'w', encoding='utf-8') as f: json.dump(profiles, f)
print(json.dumps(dict(ocio=o.__version__, profiles=[dict(kind=p['kind'], uniforms=[dict(symbol=u['symbol'], type=u['type'], length=len(u['values'])) for u in p['variants'][0]['uniforms']]) for p in profiles])))
