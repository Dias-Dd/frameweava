import json,sys,os
import PyOpenColorIO as ocio
directory=sys.argv[1];os.makedirs(directory,exist_ok=True)
config=ocio.Config.CreateRaw()
space=ocio.ColorSpace(name='linear-709');space.setIsData(False);config.addColorSpace(space)
look=ocio.Look(name='warm',processSpace='linear-709');look.setTransform(ocio.CDLTransform(slope=[1.05,.98,1.02],offset=[.01,-.005,.002],power=[1,1,1]));config.addLook(look)
with open(os.path.join(directory,'look.ocio'),'w',encoding='utf-8') as f:f.write(config.serialize())
with open(os.path.join(directory,'look.cube'),'w',encoding='utf-8') as f:
    f.write('TITLE "Fixed nonlinear cross-channel 3D fixture"\nLUT_3D_SIZE 5\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
    for b in range(5):
        for g in range(5):
            for r in range(5):
                x,y,z=r/4,g/4,b/4;f.write(f'{x*x*.8+y*.1} {y*y*.9+z*.05} {z*z*.7+x*.2}\n')
builtin='cg-config-v4.0.0_aces-v2.0_ocio-v2.5'
bc=ocio.Config.CreateFromBuiltinConfig(builtin)
views=list(bc.getViews('sRGB - Display'));view=next(v for v in views if v.startswith('ACES 2.0 - '))
json.dump(dict(config=builtin,display='sRGB - Display',view=view,linearDisplaySpace='Linear Rec.709 (sRGB)'),open(os.path.join(directory,'display.json'),'w',encoding='utf-8'))
print(json.dumps(dict(ocio=ocio.__version__,view=view)))
