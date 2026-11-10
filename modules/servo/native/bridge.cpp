// Frameweave Servo native resource adapter. Derived from the user-supplied
// Gemini Servo0.7.0 prototype; native test effects and pixel readback removed.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d11_4.h>
#include <d3d11_1.h>
#include <dxgi.h>
#include <dxgi1_2.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <vector>
#include <string>
#include <unordered_map>
#include <mutex>
#include <chrono>

// ============================================================================
// ANGLE / EGL / GLES Definitions
// ============================================================================
typedef void* EGLDisplay;
typedef void* EGLConfig;
typedef void* EGLSurface;
typedef void* EGLContext;
typedef void* EGLClientBuffer;
typedef void* EGLDeviceEXT;
typedef unsigned int EGLBoolean;
typedef unsigned int EGLenum;
typedef int EGLint;
typedef intptr_t EGLAttrib;

#define EGL_DEFAULT_DISPLAY ((void*)0)
#define EGL_NO_CONTEXT ((EGLContext)0)
#define EGL_NO_SURFACE ((EGLSurface)0)
#define EGL_NO_DISPLAY ((EGLDisplay)0)
#define EGL_FALSE 0
#define EGL_TRUE 1

#define EGL_PLATFORM_ANGLE_ANGLE 0x3202
#define EGL_PLATFORM_ANGLE_TYPE_ANGLE 0x3203
#define EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE 0x3208
#define EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE 0x3209
#define EGL_PLATFORM_ANGLE_DEVICE_TYPE_HARDWARE_ANGLE 0x320A
#define EGL_PLATFORM_ANGLE_DEVICE_ID_HIGH_ANGLE 0x34D6
#define EGL_PLATFORM_ANGLE_DEVICE_ID_LOW_ANGLE 0x34D7
#define EGL_PLATFORM_ANGLE_D3D_LUID_HIGH_ANGLE 0x34A0
#define EGL_PLATFORM_ANGLE_D3D_LUID_LOW_ANGLE 0x34A1
#define EGL_D3D11_DEVICE_ANGLE 0x33A1
#define EGL_EXTENSIONS 0x3055
#define EGL_DEVICE_EXT 0x322C
#define EGL_D3D_TEXTURE_2D_SHARE_HANDLE_ANGLE 0x3200
#define EGL_DXGI_KEYED_MUTEX_ANGLE 0x33A2

#define EGL_WIDTH 0x3057
#define EGL_HEIGHT 0x3056
#define EGL_TEXTURE_FORMAT 0x3080
#define EGL_TEXTURE_TARGET 0x3081
#define EGL_TEXTURE_RGBA 0x305E
#define EGL_TEXTURE_2D 0x305F
#define EGL_BACK_BUFFER 0x3084
#define EGL_NONE 0x3038
#define EGL_SURFACE_TYPE 0x3033
#define EGL_PBUFFER_BIT 0x0001
#define EGL_RENDERABLE_TYPE 0x3036
#define EGL_OPENGL_ES3_BIT 0x00000040
#define EGL_RED_SIZE 0x3024
#define EGL_GREEN_SIZE 0x3023
#define EGL_BLUE_SIZE 0x3022
#define EGL_ALPHA_SIZE 0x3021
#define EGL_DEPTH_SIZE 0x3025
#define EGL_STENCIL_SIZE 0x3026
#define EGL_CONTEXT_CLIENT_VERSION 0x3098
#define EGL_BIND_TO_TEXTURE_RGBA 0x303A
#define EGL_COLOR_COMPONENT_TYPE_EXT 0x3339
#define EGL_COLOR_COMPONENT_TYPE_FLOAT_EXT 0x333B

typedef unsigned int GLenum;
typedef unsigned int GLbitfield;
typedef unsigned int GLuint;
typedef int GLint;
typedef int GLsizei;
typedef char GLchar;
typedef float GLfloat;

#define GL_TEXTURE_2D 0x0DE1
#define GL_RGBA 0x1908
#define GL_RGBA16F 0x881A
#define GL_UNSIGNED_BYTE 0x1401
#define GL_HALF_FLOAT 0x140B
#define GL_FLOAT 0x1406
#define GL_FRAMEBUFFER 0x8D40
#define GL_RENDERBUFFER 0x8D41
#define GL_COLOR_ATTACHMENT0 0x8CE0
#define GL_DEPTH_STENCIL_ATTACHMENT 0x821A
#define GL_DEPTH24_STENCIL8 0x88F0
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#define GL_COLOR_BUFFER_BIT 0x00004000
#define GL_DEPTH_BUFFER_BIT 0x00000100
#define GL_STENCIL_BUFFER_BIT 0x00000400
#define GL_NEAREST 0x2600
#define GL_LINEAR 0x2601
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_WRAP_S 0x2802
#define GL_TEXTURE_WRAP_T 0x2803
#define GL_CLAMP_TO_EDGE 0x812F
#define GL_VERTEX_SHADER 0x8B31
#define GL_FRAGMENT_SHADER 0x8B30
#define GL_COMPILE_STATUS 0x8B81
#define GL_LINK_STATUS 0x8B82
#define GL_TRIANGLES 0x0004

typedef EGLDisplay (*PFNEGLGETPLATFORMDISPLAYEXTPROC)(EGLenum platform, void* native_display, const EGLint* attrib_list);
typedef EGLBoolean (*PFNEGLINITIALIZEPROC)(EGLDisplay dpy, EGLint* major, EGLint* minor);
typedef EGLBoolean (*PFNEGLCHOOSECONFIGPROC)(EGLDisplay dpy, const EGLint* attrib_list, EGLConfig* configs, EGLint config_size, EGLint* num_config);
typedef EGLContext (*PFNEGLCREATECONTEXTPROC)(EGLDisplay dpy, EGLConfig config, EGLContext share_context, const EGLint* attrib_list);
typedef EGLSurface (*PFNEGLCREATEPBUFFERSURFACEPROC)(EGLDisplay dpy, EGLConfig config, const EGLint* attrib_list);
typedef EGLSurface (*PFNEGLCREATEPBUFFERFROMCLIENTBUFFERPROC)(EGLDisplay dpy, EGLenum buftype, EGLClientBuffer buffer, EGLConfig config, const EGLint* attrib_list);
typedef EGLBoolean (*PFNEGLMAKECURRENTPROC)(EGLDisplay dpy, EGLSurface draw, EGLSurface read, EGLContext ctx);
typedef EGLBoolean (*PFNEGLBINDTEXIMAGEPROC)(EGLDisplay dpy, EGLSurface surface, EGLint buffer);
typedef EGLBoolean (*PFNEGLRELEASETEXIMAGEPROC)(EGLDisplay dpy, EGLSurface surface, EGLint buffer);
typedef EGLBoolean (*PFNEGLDESTROYSURFACEPROC)(EGLDisplay dpy, EGLSurface surface);
typedef EGLBoolean (*PFNEGLDESTROYCONTEXTPROC)(EGLDisplay dpy, EGLContext ctx);
typedef EGLBoolean (*PFNEGLTERMINATEPROC)(EGLDisplay dpy);
typedef EGLint     (*PFNEGLGETERRORPROC)(void);
typedef void*      (*PFNEGLGETPROCADDRESSPROC)(const char* procname);
typedef const char* (*PFNEGLQUERYSTRINGPROC)(EGLDisplay dpy, EGLint name);
typedef EGLBoolean (*PFNEGLQUERYDISPLAYATTRIBEXTPROC)(EGLDisplay dpy, EGLint attribute, EGLAttrib* value);
typedef EGLBoolean (*PFNEGLQUERYDEVICEATTRIBEXTPROC)(EGLDeviceEXT device, EGLint attribute, EGLAttrib* value);

typedef void (*PFNGLVIEWPORTPROC)(GLint x, GLint y, GLsizei width, GLsizei height);
typedef void (*PFNGLCLEARCOLORPROC)(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
typedef void (*PFNGLCLEARPROC)(GLbitfield mask);
typedef void (*PFNGLGENTEXTURESPROC)(GLsizei n, GLuint* textures);
typedef void (*PFNGLDELETETEXTURESPROC)(GLsizei n, const GLuint* textures);
typedef void (*PFNGLBINDTEXTUREPROC)(GLenum target, GLuint texture);
typedef void (*PFNGLTEXPARAMETERIPROC)(GLenum target, GLenum pname, GLint param);
typedef void (*PFNGLGENFRAMEBUFFERSPROC)(GLsizei n, GLuint* framebuffers);
typedef void (*PFNGLDELETEFRAMEBUFFERSPROC)(GLsizei n, const GLuint* framebuffers);
typedef void (*PFNGLBINDFRAMEBUFFERPROC)(GLenum target, GLuint framebuffer);
typedef void (*PFNGLFRAMEBUFFERTEXTURE2DPROC)(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
typedef void (*PFNGLGENRENDERBUFFERSPROC)(GLsizei n, GLuint* renderbuffers);
typedef void (*PFNGLDELETERENDERBUFFERSPROC)(GLsizei n, const GLuint* renderbuffers);
typedef void (*PFNGLBINDRENDERBUFFERPROC)(GLenum target, GLuint renderbuffer);
typedef void (*PFNGLRENDERBUFFERSTORAGEPROC)(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
typedef void (*PFNGLFRAMEBUFFERRENDERBUFFERPROC)(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
typedef GLenum (*PFNGLCHECKFRAMEBUFFERSTATUSPROC)(GLenum target);
typedef void (*PFNGLFINISHPROC)(void);
typedef void (*PFNGLFLUSHPROC)(void);
typedef GLenum (*PFNGLGETERRORPROC)(void);
typedef const unsigned char* (*PFNGLGETSTRINGPROC)(GLenum name);
typedef GLuint (*PFNGLCREATESHADERPROC)(GLenum type);
typedef void (*PFNGLSHADERSOURCEPROC)(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
typedef void (*PFNGLCOMPILESHADERPROC)(GLuint shader);
typedef void (*PFNGLGETSHADERIVPROC)(GLuint shader, GLenum pname, GLint* params);
typedef GLuint (*PFNGLCREATEPROGRAMPROC)(void);
typedef void (*PFNGLATTACHSHADERPROC)(GLuint program, GLuint shader);
typedef void (*PFNGLLINKPROGRAMPROC)(GLuint program);
typedef void (*PFNGLGETPROGRAMIVPROC)(GLuint program, GLenum pname, GLint* params);
typedef void (*PFNGLUSEPROGRAMPROC)(GLuint program);
typedef void (*PFNGLDELETESHADERPROC)(GLuint shader);
typedef void (*PFNGLDELETEPROGRAMPROC)(GLuint program);
typedef GLint (*PFNGLGETUNIFORMLOCATIONPROC)(GLuint program, const GLchar* name);
typedef void (*PFNGLUNIFORM1IPROC)(GLint location, GLint v0);
typedef void (*PFNGLDRAWARRAYSPROC)(GLenum mode, GLint first, GLsizei count);
typedef void (*PFNGLGENVERTEXARRAYSPROC)(GLsizei n, GLuint* arrays);
typedef void (*PFNGLBINDVERTEXARRAYPROC)(GLuint array);
typedef void (*PFNGLDELETEVERTEXARRAYSPROC)(GLsizei n, const GLuint* arrays);

// ============================================================================
// Embedded HLSL Shaders for Native D3D11 GPU Passes
// ============================================================================
struct SharedTexEntry {
    uint32_t id = 0;
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t format_code = 0; // 0 = BGRA8, 1 = RGBA16F
    uint32_t share_mode = 0;
    ID3D11Texture2D* tex = nullptr;
    ID3D11RenderTargetView* rtv = nullptr;
    ID3D11ShaderResourceView* srv = nullptr;
    HANDLE share_handle = nullptr;
    HANDLE nt_handle = nullptr;
};

struct CachedTargetSurface {
    uint32_t tex_id = 0;
    uintptr_t share_handle = 0;
    uint32_t width = 0;
    uint32_t height = 0;
    EGLSurface pbuffer = EGL_NO_SURFACE;
};

struct ServoGlContextEntry {
    uint32_t ctx_id = 0;
    uint32_t width = 0;
    uint32_t height = 0;
    EGLContext egl_ctx = EGL_NO_CONTEXT;
    EGLSurface dummy_surface = EGL_NO_SURFACE;
    EGLSurface active_surface = EGL_NO_SURFACE;
    uint32_t active_target_tex_id = 0;
    std::vector<CachedTargetSurface> target_cache;
};

struct ImportedExtTexEntry {
    uint32_t painter_id = 0;
    uint64_t external_id = 0;
    uintptr_t share_handle = 0;
    uint32_t width = 0;
    uint32_t height = 0;
    EGLSurface pbuffer = EGL_NO_SURFACE;
    GLuint gl_tex = 0;
    bool bound = false;
};

static struct BridgeState {
    std::mutex mtx;
    bool initialized = false;

    ID3D11Device* d3d_device = nullptr;
    ID3D11DeviceContext* d3d_context = nullptr;
    std::string adapter_name;
    LUID adapter_luid = {};
    uint32_t vendor_id = 0;
    uint32_t device_id = 0;
    bool angle_shares_same_luid = false;
    uintptr_t angle_d3d11_device_ptr = 0;

    ID3D11VertexShader* quad_vs = nullptr;
    ID3D11PixelShader* gradient_ps = nullptr;
    ID3D11PixelShader* blur_ps = nullptr;
    ID3D11PixelShader* color_grade_ps = nullptr;
    ID3D11PixelShader* corner_pattern_ps = nullptr;
    ID3D11PixelShader* checkerboard_ps = nullptr;
    ID3D11PixelShader* premul_composite_ps = nullptr;
    ID3D11PixelShader* hdr_generate_ps = nullptr;

    ID3D11SamplerState* linear_sampler = nullptr;
    ID3D11Buffer* constant_buffer = nullptr;
    ID3D11RasterizerState* raster_state = nullptr;

    ID3D11Query* disjoint_query = nullptr;
    ID3D11Query* ts_start_query = nullptr;
    ID3D11Query* ts_end_query = nullptr;
    ID3D11Query* event_query = nullptr;
    std::chrono::high_resolution_clock::time_point timer_cpu_start;

    HMODULE hEGL = nullptr;
    HMODULE hGLES = nullptr;

    PFNEGLGETPLATFORMDISPLAYEXTPROC eglGetPlatformDisplayEXT = nullptr;
    PFNEGLINITIALIZEPROC eglInitialize = nullptr;
    PFNEGLCHOOSECONFIGPROC eglChooseConfig = nullptr;
    PFNEGLCREATECONTEXTPROC eglCreateContext = nullptr;
    PFNEGLCREATEPBUFFERSURFACEPROC eglCreatePbufferSurface = nullptr;
    PFNEGLCREATEPBUFFERFROMCLIENTBUFFERPROC eglCreatePbufferFromClientBuffer = nullptr;
    PFNEGLMAKECURRENTPROC eglMakeCurrent = nullptr;
    PFNEGLBINDTEXIMAGEPROC eglBindTexImage = nullptr;
    PFNEGLRELEASETEXIMAGEPROC eglReleaseTexImage = nullptr;
    PFNEGLDESTROYSURFACEPROC eglDestroySurface = nullptr;
    PFNEGLDESTROYCONTEXTPROC eglDestroyContext = nullptr;
    PFNEGLTERMINATEPROC eglTerminate = nullptr;
    PFNEGLGETERRORPROC eglGetError = nullptr;
    PFNEGLGETPROCADDRESSPROC eglGetProcAddress = nullptr;
    PFNEGLQUERYSTRINGPROC eglQueryString = nullptr;
    PFNEGLQUERYDISPLAYATTRIBEXTPROC eglQueryDisplayAttribEXT = nullptr;
    PFNEGLQUERYDEVICEATTRIBEXTPROC eglQueryDeviceAttribEXT = nullptr;

    PFNGLVIEWPORTPROC glViewport = nullptr;
    PFNGLCLEARCOLORPROC glClearColor = nullptr;
    PFNGLCLEARPROC glClear = nullptr;
    PFNGLGENTEXTURESPROC glGenTextures = nullptr;
    PFNGLDELETETEXTURESPROC glDeleteTextures = nullptr;
    PFNGLBINDTEXTUREPROC glBindTexture = nullptr;
    PFNGLTEXPARAMETERIPROC glTexParameteri = nullptr;
    PFNGLGENFRAMEBUFFERSPROC glGenFramebuffers = nullptr;
    PFNGLDELETEFRAMEBUFFERSPROC glDeleteFramebuffers = nullptr;
    PFNGLBINDFRAMEBUFFERPROC glBindFramebuffer = nullptr;
    PFNGLFRAMEBUFFERTEXTURE2DPROC glFramebufferTexture2D = nullptr;
    PFNGLGENRENDERBUFFERSPROC glGenRenderbuffers = nullptr;
    PFNGLDELETERENDERBUFFERSPROC glDeleteRenderbuffers = nullptr;
    PFNGLBINDRENDERBUFFERPROC glBindRenderbuffer = nullptr;
    PFNGLRENDERBUFFERSTORAGEPROC glRenderbufferStorage = nullptr;
    PFNGLFRAMEBUFFERRENDERBUFFERPROC glFramebufferRenderbuffer = nullptr;
    PFNGLCHECKFRAMEBUFFERSTATUSPROC glCheckFramebufferStatus = nullptr;
    PFNGLFINISHPROC glFinish = nullptr;
    PFNGLFLUSHPROC glFlush = nullptr;
    PFNGLGETERRORPROC glGetError = nullptr;
    PFNGLGETSTRINGPROC glGetString = nullptr;
    PFNGLCREATESHADERPROC glCreateShader = nullptr;
    PFNGLSHADERSOURCEPROC glShaderSource = nullptr;
    PFNGLCOMPILESHADERPROC glCompileShader = nullptr;
    PFNGLGETSHADERIVPROC glGetShaderiv = nullptr;
    PFNGLCREATEPROGRAMPROC glCreateProgram = nullptr;
    PFNGLATTACHSHADERPROC glAttachShader = nullptr;
    PFNGLLINKPROGRAMPROC glLinkProgram = nullptr;
    PFNGLGETPROGRAMIVPROC glGetProgramiv = nullptr;
    PFNGLUSEPROGRAMPROC glUseProgram = nullptr;
    PFNGLDELETESHADERPROC glDeleteShader = nullptr;
    PFNGLDELETEPROGRAMPROC glDeleteProgram = nullptr;
    PFNGLGETUNIFORMLOCATIONPROC glGetUniformLocation = nullptr;
    PFNGLUNIFORM1IPROC glUniform1i = nullptr;
    PFNGLDRAWARRAYSPROC glDrawArrays = nullptr;
    PFNGLGENVERTEXARRAYSPROC glGenVertexArrays = nullptr;
    PFNGLBINDVERTEXARRAYPROC glBindVertexArray = nullptr;
    PFNGLDELETEVERTEXARRAYSPROC glDeleteVertexArrays = nullptr;

    EGLDisplay egl_display = EGL_NO_DISPLAY;
    EGLConfig egl_fbo_config = nullptr;
    EGLConfig egl_tex_config = nullptr;
    EGLConfig egl_fp16_config = nullptr;

    uint32_t next_tex_id = 0;
    std::unordered_map<uint32_t, SharedTexEntry> textures;

    uint32_t next_servo_ctx_id = 0;
    std::unordered_map<uint32_t, ServoGlContextEntry> servo_contexts;
    uint32_t current_servo_ctx_id = 0;

    std::vector<ImportedExtTexEntry> imported_textures;

    uint64_t production_readbacks = 0;
    uint64_t diagnostic_readbacks = 0;
    uint32_t active_d3d_textures = 0;
    uint32_t active_egl_surfaces = 0;
    uint32_t released_egl_surfaces = 0;
} g_state;


static uint64_t requested_luid=0;
extern "C" {
__declspec(dllexport) uint32_t bridge_init() {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    if (g_state.initialized) return 1;

    D3D_FEATURE_LEVEL featureLevels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0 };
    D3D_FEATURE_LEVEL featureLevel;
    IDXGIAdapter1* selected=nullptr;
    if(requested_luid){ IDXGIFactory1* factory=nullptr;if(SUCCEEDED(CreateDXGIFactory1(__uuidof(IDXGIFactory1),(void**)&factory))){for(UINT n=0;factory->EnumAdapters1(n,&selected)!=DXGI_ERROR_NOT_FOUND;n++){DXGI_ADAPTER_DESC1 d={};selected->GetDesc1(&d);uint64_t bits=0;memcpy(&bits,&d.AdapterLuid,8);if(bits==requested_luid)break;selected->Release();selected=nullptr;}factory->Release();}if(!selected)return 0;}
    HRESULT hr = D3D11CreateDevice(
        selected,
        selected ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        featureLevels,
        2,
        D3D11_SDK_VERSION,
        &g_state.d3d_device,
        &featureLevel,
        &g_state.d3d_context
    );
    if(selected)selected->Release();
    if (FAILED(hr)) {
        fprintf(stderr,"[Bridge][FAIL] D3D11CreateDevice failed: 0x%08X\n", hr);
        return 0;
    }

    IDXGIDevice* dxgiDev = nullptr;
    if (SUCCEEDED(g_state.d3d_device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDev))) {
        IDXGIAdapter* adapter = nullptr;
        if (SUCCEEDED(dxgiDev->GetAdapter(&adapter))) {
            DXGI_ADAPTER_DESC desc = {};
            adapter->GetDesc(&desc);
            char nameBuf[256] = {};
            WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, nameBuf, sizeof(nameBuf) - 1, nullptr, nullptr);
            g_state.adapter_name = nameBuf;
            g_state.adapter_luid = desc.AdapterLuid;
            g_state.vendor_id = desc.VendorId;
            g_state.device_id = desc.DeviceId;
            adapter->Release();
        }
        dxgiDev->Release();
    }

    // Create D3D11 Queries for hardware timestamps & completion fence
    // Load ANGLE DLLs
    HMODULE self=nullptr;GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,(LPCWSTR)&bridge_init,&self);wchar_t path[32768];DWORD count=GetModuleFileNameW(self,path,32768);if(!count||count>=32768)return 0;std::wstring directory(path);directory=directory.substr(0,directory.find_last_of(L"\\")+1);
    g_state.hEGL=LoadLibraryExW((directory+L"libEGL.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);
    g_state.hGLES=LoadLibraryExW((directory+L"libGLESv2.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!g_state.hEGL || !g_state.hGLES) {
        fprintf(stderr,"[Bridge][FAIL] Could not load libEGL.dll / libGLESv2.dll\n");
        return 0;
    }

    #define LOAD_EGL(fn) g_state.fn = (decltype(g_state.fn))GetProcAddress(g_state.hEGL, #fn)
    LOAD_EGL(eglGetPlatformDisplayEXT);
    LOAD_EGL(eglInitialize);
    LOAD_EGL(eglChooseConfig);
    LOAD_EGL(eglCreateContext);
    LOAD_EGL(eglCreatePbufferSurface);
    LOAD_EGL(eglCreatePbufferFromClientBuffer);
    LOAD_EGL(eglMakeCurrent);
    LOAD_EGL(eglBindTexImage);
    LOAD_EGL(eglReleaseTexImage);
    LOAD_EGL(eglDestroySurface);
    LOAD_EGL(eglDestroyContext);
    LOAD_EGL(eglTerminate);
    LOAD_EGL(eglGetError);
    LOAD_EGL(eglGetProcAddress);
    LOAD_EGL(eglQueryString);
    LOAD_EGL(eglQueryDisplayAttribEXT);
    LOAD_EGL(eglQueryDeviceAttribEXT);
    #undef LOAD_EGL

    #define LOAD_GL(fn) g_state.fn = (decltype(g_state.fn))GetProcAddress(g_state.hGLES, #fn)
    LOAD_GL(glViewport);
    LOAD_GL(glClearColor);
    LOAD_GL(glClear);
    LOAD_GL(glGenTextures);
    LOAD_GL(glDeleteTextures);
    LOAD_GL(glBindTexture);
    LOAD_GL(glTexParameteri);
    LOAD_GL(glGenFramebuffers);
    LOAD_GL(glDeleteFramebuffers);
    LOAD_GL(glBindFramebuffer);
    LOAD_GL(glFramebufferTexture2D);
    LOAD_GL(glGenRenderbuffers);
    LOAD_GL(glDeleteRenderbuffers);
    LOAD_GL(glBindRenderbuffer);
    LOAD_GL(glRenderbufferStorage);
    LOAD_GL(glFramebufferRenderbuffer);
    LOAD_GL(glCheckFramebufferStatus);
    LOAD_GL(glFinish);
    LOAD_GL(glFlush);
    LOAD_GL(glGetError);
    LOAD_GL(glGetString);
    LOAD_GL(glCreateShader);
    LOAD_GL(glShaderSource);
    LOAD_GL(glCompileShader);
    LOAD_GL(glGetShaderiv);
    LOAD_GL(glCreateProgram);
    LOAD_GL(glAttachShader);
    LOAD_GL(glLinkProgram);
    LOAD_GL(glGetProgramiv);
    LOAD_GL(glUseProgram);
    LOAD_GL(glDeleteShader);
    LOAD_GL(glDeleteProgram);
    LOAD_GL(glGetUniformLocation);
    LOAD_GL(glUniform1i);
    LOAD_GL(glDrawArrays);
    LOAD_GL(glGenVertexArrays);
    LOAD_GL(glBindVertexArray);
    LOAD_GL(glDeleteVertexArrays);
    #undef LOAD_GL

    std::vector<EGLint> dispAttribs = {
        EGL_PLATFORM_ANGLE_TYPE_ANGLE, EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE,
        EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE, EGL_PLATFORM_ANGLE_DEVICE_TYPE_HARDWARE_ANGLE,
    };
    const char* extensions = g_state.eglQueryString ? g_state.eglQueryString(EGL_NO_DISPLAY, EGL_EXTENSIONS) : nullptr;
    if (requested_luid && extensions) {
        const std::string clientExtensions = std::string(" ") + extensions + " ";
        const bool deviceId = clientExtensions.find(" EGL_ANGLE_platform_angle_device_id ") != std::string::npos;
        const bool legacyLuid = clientExtensions.find(" EGL_ANGLE_platform_angle_d3d_luid ") != std::string::npos;
        // ANGLE's D3D11 renderer accepts a DXGI LUID as a platform device ID.
        if (deviceId || legacyLuid) {
            dispAttribs.insert(dispAttribs.end(), {
                deviceId ? EGL_PLATFORM_ANGLE_DEVICE_ID_HIGH_ANGLE : EGL_PLATFORM_ANGLE_D3D_LUID_HIGH_ANGLE,
                static_cast<EGLint>(g_state.adapter_luid.HighPart),
                deviceId ? EGL_PLATFORM_ANGLE_DEVICE_ID_LOW_ANGLE : EGL_PLATFORM_ANGLE_D3D_LUID_LOW_ANGLE,
                static_cast<EGLint>(g_state.adapter_luid.LowPart),
            });
        }
    }
    dispAttribs.push_back(EGL_NONE);
    g_state.egl_display = g_state.eglGetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE, EGL_DEFAULT_DISPLAY, dispAttribs.data());
    EGLint major = 0, minor = 0;
    if (!g_state.egl_display || !g_state.eglInitialize(g_state.egl_display, &major, &minor)) {
        fprintf(stderr,"[Bridge][FAIL] eglInitialize failed: 0x%X\n", g_state.eglGetError());
        return 0;
    }

    // Query ANGLE's internal ID3D11Device* and verify LUID matches our Native D3D11Device!
    if (g_state.eglQueryDisplayAttribEXT && g_state.eglQueryDeviceAttribEXT) {
        EGLAttrib eglDev = 0;
        if (g_state.eglQueryDisplayAttribEXT(g_state.egl_display, EGL_DEVICE_EXT, &eglDev) && eglDev) {
            EGLAttrib angleD3D11 = 0;
            if (g_state.eglQueryDeviceAttribEXT((EGLDeviceEXT)eglDev, EGL_D3D11_DEVICE_ANGLE, &angleD3D11) && angleD3D11) {
                g_state.angle_d3d11_device_ptr = (uintptr_t)angleD3D11;
                ID3D11Device* pAngleDev = (ID3D11Device*)angleD3D11;
                IDXGIDevice* pAngleDxgi = nullptr;
                if (SUCCEEDED(pAngleDev->QueryInterface(__uuidof(IDXGIDevice), (void**)&pAngleDxgi))) {
                    IDXGIAdapter* pAngleAdapter = nullptr;
                    if (SUCCEEDED(pAngleDxgi->GetAdapter(&pAngleAdapter))) {
                        DXGI_ADAPTER_DESC aDesc = {};
                        pAngleAdapter->GetDesc(&aDesc);
                        g_state.angle_shares_same_luid =
                            (aDesc.AdapterLuid.LowPart == g_state.adapter_luid.LowPart &&
                             aDesc.AdapterLuid.HighPart == g_state.adapter_luid.HighPart);
                        pAngleAdapter->Release();
                    }
                    pAngleDxgi->Release();
                }
            }
        }
    }

    // Config 1: FBO/RenderTarget config with 24-bit depth and 8-bit stencil for WebRender
    EGLint fboConfigAttribs[] = {
        EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8,
        EGL_ALPHA_SIZE, 8,
        EGL_DEPTH_SIZE, 24,
        EGL_STENCIL_SIZE, 8,
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_BIND_TO_TEXTURE_RGBA, EGL_TRUE,
        EGL_NONE
    };
    EGLint numConfigs = 0;
    if (!g_state.eglChooseConfig(g_state.egl_display, fboConfigAttribs, &g_state.egl_fbo_config, 1, &numConfigs) || numConfigs < 1) {
        fprintf(stderr,"[Bridge][FAIL] eglChooseConfig (FBO) failed: 0x%X\n", g_state.eglGetError());
        return 0;
    }
    g_state.egl_tex_config = g_state.egl_fbo_config;

    // Config 2: Optional FP16 config if supported by ANGLE
    EGLint fp16ConfigAttribs[] = {
        EGL_RED_SIZE, 16,
        EGL_GREEN_SIZE, 16,
        EGL_BLUE_SIZE, 16,
        EGL_ALPHA_SIZE, 16,
        EGL_COLOR_COMPONENT_TYPE_EXT, EGL_COLOR_COMPONENT_TYPE_FLOAT_EXT,
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
        EGL_BIND_TO_TEXTURE_RGBA, EGL_TRUE,
        EGL_NONE
    };
    EGLint numFp16 = 0;
    g_state.eglChooseConfig(g_state.egl_display, fp16ConfigAttribs, &g_state.egl_fp16_config, 1, &numFp16);

    fprintf(stderr,"[Bridge][PASS] Initialized D3D11 + ANGLE on '%s' (Vendor=0x%04X, Device=0x%04X, LUID=%08X:%08X, SameLUID=%d, FP16Configs=%d)\n",
        g_state.adapter_name.c_str(),
        g_state.vendor_id,
        g_state.device_id,
        (uint32_t)g_state.adapter_luid.HighPart,
        (uint32_t)g_state.adapter_luid.LowPart,
        g_state.angle_shares_same_luid ? 1 : 0,
        numFp16);

    g_state.initialized = true;
    return 1;
}

// Engine-owned external image and GPU synchronization extension v1.
// These handles never enter HTML, authored JS, or a serialized Surface.
struct SharedFence {ID3D11Fence* fence=nullptr;HANDLE handle=nullptr;};
static std::unordered_map<uint32_t,SharedFence> module_fences;
static uint32_t next_module_fence=0;
static ID3D11DeviceContext4* angle_context4=nullptr;
extern "C" {
__declspec(dllexport) uint32_t bridge_abi_version(){return 1;}
__declspec(dllexport) uint32_t bridge_select_adapter(uint64_t luid){
 std::lock_guard<std::mutex> lock(g_state.mtx);uint64_t actual=0;memcpy(&actual,&g_state.adapter_luid,8);if(g_state.initialized)return actual==luid&&g_state.angle_shares_same_luid;requested_luid=luid;return 1;
}
__declspec(dllexport) uintptr_t bridge_texture_nt_handle(uint32_t id){std::lock_guard<std::mutex> lock(g_state.mtx);auto i=g_state.textures.find(id);return i==g_state.textures.end()?0:reinterpret_cast<uintptr_t>(i->second.nt_handle);}
__declspec(dllexport) uint32_t bridge_create_module_fence(uintptr_t* out){
 std::lock_guard<std::mutex> lock(g_state.mtx);auto device=reinterpret_cast<ID3D11Device*>(g_state.angle_d3d11_device_ptr);if(!device)return 0;ID3D11Device5* device5=nullptr;HRESULT hr=device->QueryInterface(__uuidof(ID3D11Device5),(void**)&device5);if(FAILED(hr))return 0;
 if(!angle_context4){ID3D11DeviceContext* context=nullptr;device->GetImmediateContext(&context);hr=context->QueryInterface(__uuidof(ID3D11DeviceContext4),(void**)&angle_context4);context->Release();}
 SharedFence f;if(SUCCEEDED(hr))hr=device5->CreateFence(0,D3D11_FENCE_FLAG_SHARED,__uuidof(ID3D11Fence),(void**)&f.fence);device5->Release();if(SUCCEEDED(hr))hr=f.fence->CreateSharedHandle(nullptr,GENERIC_ALL,nullptr,&f.handle);if(FAILED(hr)){if(f.fence)f.fence->Release();return 0;}
 uint32_t id=++next_module_fence;module_fences[id]=f;*out=reinterpret_cast<uintptr_t>(f.handle);return id;
}
__declspec(dllexport) int32_t bridge_module_wait(uint32_t id,uint64_t value){std::lock_guard<std::mutex> lock(g_state.mtx);auto f=module_fences.find(id);return f==module_fences.end()?E_INVALIDARG:angle_context4->Wait(f->second.fence,value);}
__declspec(dllexport) int32_t bridge_module_signal(uint32_t id,uint64_t value){std::lock_guard<std::mutex> lock(g_state.mtx);auto f=module_fences.find(id);if(f==module_fences.end())return E_INVALIDARG;g_state.glFlush();HRESULT hr=angle_context4->Signal(f->second.fence,value);angle_context4->Flush();return hr;}
__declspec(dllexport) void bridge_release_module_fence(uint32_t id){std::lock_guard<std::mutex> lock(g_state.mtx);auto f=module_fences.find(id);if(f==module_fences.end())return;f->second.fence->Release();CloseHandle(f->second.handle);module_fences.erase(f);}
__declspec(dllexport) void bridge_destroy_servo_context(uint32_t id){
 std::lock_guard<std::mutex> lock(g_state.mtx);auto i=g_state.servo_contexts.find(id);if(i==g_state.servo_contexts.end())return;auto& ctx=i->second;g_state.eglMakeCurrent(g_state.egl_display,ctx.dummy_surface,ctx.dummy_surface,ctx.egl_ctx);
 // External imports must have been unregistered by the owner before teardown.
 for(auto& target:ctx.target_cache){if(target.pbuffer){g_state.eglDestroySurface(g_state.egl_display,target.pbuffer);if(g_state.active_egl_surfaces)g_state.active_egl_surfaces--;g_state.released_egl_surfaces++;}}
 g_state.eglMakeCurrent(g_state.egl_display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);g_state.eglDestroySurface(g_state.egl_display,ctx.dummy_surface);g_state.eglDestroyContext(g_state.egl_display,ctx.egl_ctx);g_state.servo_contexts.erase(i);if(g_state.current_servo_ctx_id==id)g_state.current_servo_ctx_id=0;
}
__declspec(dllexport) uint64_t bridge_live_resources(){std::lock_guard<std::mutex> lock(g_state.mtx);return (uint64_t(g_state.servo_contexts.size())<<48)|(uint64_t(module_fences.size())<<32)|uint64_t(g_state.active_d3d_textures);}
}

__declspec(dllexport) uint32_t bridge_create_shared_texture(
    uint32_t width,
    uint32_t height,
    uint32_t format_code,
    uint32_t share_mode,
    uintptr_t* out_share_handle
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    DXGI_FORMAT fmt = (format_code == 1) ? DXGI_FORMAT_R16G16B16A16_FLOAT : DXGI_FORMAT_B8G8R8A8_UNORM;

    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = width;
    desc.Height = height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = fmt;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    if (share_mode == 3) {
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED_NTHANDLE | D3D11_RESOURCE_MISC_SHARED;
    } else if (share_mode == 1) {
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED_NTHANDLE | D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX;
    } else if (share_mode == 2) {
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX;
    } else {
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED;
    }

    ID3D11Texture2D* tex = nullptr;
    HRESULT hr = g_state.d3d_device->CreateTexture2D(&desc, nullptr, &tex);
    if (FAILED(hr) || !tex) {
        fprintf(stderr,"[Bridge][ERROR] CreateTexture2D(%ux%u, fmt=%u, mode=%u) failed: 0x%08X\n",
            width, height, format_code, share_mode, hr);
        return 0;
    }

    ID3D11RenderTargetView* rtv = nullptr;
    g_state.d3d_device->CreateRenderTargetView(tex, nullptr, &rtv);
    ID3D11ShaderResourceView* srv = nullptr;
    g_state.d3d_device->CreateShaderResourceView(tex, nullptr, &srv);

    HANDLE shareHandle = nullptr;
    if (share_mode == 1 || share_mode == 3) {
        IDXGIResource1* res1 = nullptr;
        if (SUCCEEDED(tex->QueryInterface(__uuidof(IDXGIResource1), (void**)&res1))) {
            hr=res1->CreateSharedHandle(nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE, nullptr, &shareHandle);
            res1->Release();
        }
    } else {
        IDXGIResource* res = nullptr;
        if (SUCCEEDED(tex->QueryInterface(__uuidof(IDXGIResource), (void**)&res))) {
            res->GetSharedHandle(&shareHandle);
            res->Release();
        }
    }

    if (!shareHandle) {
        fprintf(stderr,"[Bridge][ERROR] shared handle creation failed mode=%u hr=0x%08X\n",share_mode,hr);
        if(srv)srv->Release();if(rtv)rtv->Release();tex->Release();return 0;
    }

    uint32_t id = ++g_state.next_tex_id;
    SharedTexEntry entry = {};
    entry.id = id;
    entry.width = width;
    entry.height = height;
    entry.format_code = format_code;
    entry.share_mode = share_mode;
    entry.tex = tex;
    entry.rtv = rtv;
    entry.srv = srv;
    entry.share_handle = shareHandle;
    // NT resources cannot also expose a legacy KMT handle. ANGLE imports the
    // same NT handle through OpenSharedResource1; Vulkan imports it as NT too.
    if (share_mode == 3) entry.nt_handle=shareHandle;
    g_state.textures[id] = entry;
    g_state.active_d3d_textures++;

    if (out_share_handle) {
        *out_share_handle = (uintptr_t)shareHandle;
    }
    return id;
}

__declspec(dllexport) void bridge_release_texture(uint32_t tex_id) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    auto it = g_state.textures.find(tex_id);
    if (it == g_state.textures.end()) return;

    // Also destroy any cached target EGLSurface referencing this texture
    for (auto& kv : g_state.servo_contexts) {
        auto& ctx = kv.second;
        for (auto surfIt = ctx.target_cache.begin(); surfIt != ctx.target_cache.end(); ) {
            if (surfIt->tex_id == tex_id) {
                if (surfIt->pbuffer != EGL_NO_SURFACE) {
                    if (ctx.active_surface == surfIt->pbuffer) {
                        g_state.eglMakeCurrent(g_state.egl_display, ctx.dummy_surface, ctx.dummy_surface, ctx.egl_ctx);
                        ctx.active_surface = ctx.dummy_surface;
                    }
                    g_state.eglDestroySurface(g_state.egl_display, surfIt->pbuffer);
                    if (g_state.active_egl_surfaces > 0) g_state.active_egl_surfaces--;
                    g_state.released_egl_surfaces++;
                }
                surfIt = ctx.target_cache.erase(surfIt);
            } else {
                ++surfIt;
            }
        }
    }

    if (it->second.share_mode == 1 && it->second.share_handle) {
        CloseHandle(it->second.share_handle);
    }
    if (it->second.nt_handle) CloseHandle(it->second.nt_handle);
    if (it->second.srv) it->second.srv->Release();
    if (it->second.rtv) it->second.rtv->Release();
    if (it->second.tex) it->second.tex->Release();
    g_state.textures.erase(it);
    if (g_state.active_d3d_textures > 0) g_state.active_d3d_textures--;
}

#ifndef EGL_SURFACE_ORIENTATION_ANGLE
#define EGL_SURFACE_ORIENTATION_ANGLE 0x33A8
#define EGL_SURFACE_ORIENTATION_INVERT_Y_ANGLE 0x0002
#endif

static EGLSurface GetOrCreateTargetSurfaceLocked(ServoGlContextEntry& ctx, const SharedTexEntry& tex) {
    for (const auto& item : ctx.target_cache) {
        if (item.tex_id == tex.id &&
            item.share_handle == (uintptr_t)tex.share_handle &&
            item.width == tex.width &&
            item.height == tex.height) {
            return item.pbuffer;
        }
    }
    for (auto& kv : g_state.servo_contexts) {
        for (const auto& item : kv.second.target_cache) {
            if (item.tex_id == tex.id &&
                item.share_handle == (uintptr_t)tex.share_handle &&
                item.width == tex.width &&
                item.height == tex.height &&
                item.pbuffer != EGL_NO_SURFACE) {
                return item.pbuffer;
            }
        }
    }
    EGLConfig cfg = (tex.format_code == 1 && g_state.egl_fp16_config)
        ? g_state.egl_fp16_config
        : g_state.egl_fbo_config;
    EGLint attribs[] = {
        EGL_WIDTH, (EGLint)tex.width,
        EGL_HEIGHT, (EGLint)tex.height,
        EGL_TEXTURE_FORMAT, EGL_TEXTURE_RGBA,
        EGL_TEXTURE_TARGET, EGL_TEXTURE_2D,
        EGL_NONE
    };
    EGLSurface surf = g_state.eglCreatePbufferFromClientBuffer(
        g_state.egl_display,
        EGL_D3D_TEXTURE_2D_SHARE_HANDLE_ANGLE,
        (EGLClientBuffer)tex.share_handle,
        cfg,
        attribs
    );
    if (!surf) {
        fprintf(stderr,"[Bridge][ERROR] eglCreatePbufferFromClientBuffer for target tex %u failed: 0x%X\n",
            tex.id, g_state.eglGetError());
        fflush(stderr);
        return ctx.dummy_surface;
    }
    CachedTargetSurface item = {};
    item.tex_id = tex.id;
    item.share_handle = (uintptr_t)tex.share_handle;
    item.width = tex.width;
    item.height = tex.height;
    item.pbuffer = surf;
    ctx.target_cache.push_back(item);
    g_state.active_egl_surfaces++;
    return surf;
}

__declspec(dllexport) uint32_t bridge_create_servo_context(
    uint32_t width,
    uint32_t height,
    uint32_t initial_target_tex_id
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    EGLint ctxAttribs[] = {
        EGL_CONTEXT_CLIENT_VERSION, 3,
        EGL_NONE
    };
    // Do NOT share contexts across different Painters unless needed, or share if on same thread;
    // independent EGLContexts on the same EGLDisplay can each bind any D3D11 shared texture cleanly.
    EGLContext eglCtx = g_state.eglCreateContext(g_state.egl_display, g_state.egl_fbo_config, EGL_NO_CONTEXT, ctxAttribs);
    if (!eglCtx) {
        fprintf(stderr,"[Bridge][ERROR] eglCreateContext failed: 0x%X\n", g_state.eglGetError());
        return 0;
    }

    EGLint dummyAttribs[] = {
        EGL_WIDTH, 16,
        EGL_HEIGHT, 16,
        EGL_NONE
    };
    EGLSurface dummySurf = g_state.eglCreatePbufferSurface(g_state.egl_display, g_state.egl_fbo_config, dummyAttribs);

    uint32_t ctxId = ++g_state.next_servo_ctx_id;
    ServoGlContextEntry entry = {};
    entry.ctx_id = ctxId;
    entry.width = width;
    entry.height = height;
    entry.egl_ctx = eglCtx;
    entry.dummy_surface = dummySurf;
    entry.active_surface = dummySurf;
    entry.active_target_tex_id = initial_target_tex_id;

    auto texIt = g_state.textures.find(initial_target_tex_id);
    if (texIt != g_state.textures.end()) {
        entry.active_surface = GetOrCreateTargetSurfaceLocked(entry, texIt->second);
        entry.width = texIt->second.width;
        entry.height = texIt->second.height;
    }

    g_state.eglMakeCurrent(g_state.egl_display, entry.active_surface, entry.active_surface, entry.egl_ctx);
    g_state.glBindFramebuffer(GL_FRAMEBUFFER, 0);
    g_state.glViewport(0, 0, (GLsizei)entry.width, (GLsizei)entry.height);
    GLenum fbStatus = g_state.glCheckFramebufferStatus(GL_FRAMEBUFFER);
    if (fbStatus != GL_FRAMEBUFFER_COMPLETE) {
        fprintf(stderr,"[Bridge][WARN] Servo context %u FBO status: 0x%X\n", ctxId, fbStatus);
    }

    g_state.servo_contexts[ctxId] = entry;
    g_state.current_servo_ctx_id = ctxId;
    return ctxId;
}

__declspec(dllexport) uint32_t bridge_set_servo_target_texture(
    uint32_t servo_ctx_id,
    uint32_t target_tex_id
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    auto ctxIt = g_state.servo_contexts.find(servo_ctx_id);
    auto texIt = g_state.textures.find(target_tex_id);
    if (ctxIt == g_state.servo_contexts.end() || texIt == g_state.textures.end()) {
        return 0;
    }
    auto& ctx = ctxIt->second;
    const auto& tex = texIt->second;
    ctx.active_surface = GetOrCreateTargetSurfaceLocked(ctx, tex);
    ctx.active_target_tex_id = target_tex_id;
    ctx.width = tex.width;
    ctx.height = tex.height;
    return 1;
}

__declspec(dllexport) uint32_t bridge_make_current(uint32_t servo_ctx_id) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    auto it = g_state.servo_contexts.find(servo_ctx_id);
    if (it == g_state.servo_contexts.end()) return 0;
    auto& ctx = it->second;
    if (!g_state.eglMakeCurrent(g_state.egl_display, ctx.active_surface, ctx.active_surface, ctx.egl_ctx)) {
        fprintf(stderr,"[Bridge][ERROR] eglMakeCurrent(%u) failed: 0x%X\n", servo_ctx_id, g_state.eglGetError());
        return 0;
    }
    g_state.current_servo_ctx_id = servo_ctx_id;
    return 1;
}

__declspec(dllexport) void bridge_prepare_for_rendering(uint32_t servo_ctx_id) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    auto it = g_state.servo_contexts.find(servo_ctx_id);
    if (it == g_state.servo_contexts.end()) return;
    auto& ctx = it->second;
    g_state.eglMakeCurrent(g_state.egl_display, ctx.active_surface, ctx.active_surface, ctx.egl_ctx);
    g_state.current_servo_ctx_id = servo_ctx_id;
    g_state.glBindFramebuffer(GL_FRAMEBUFFER, 0);
    g_state.glViewport(0, 0, (GLsizei)ctx.width, (GLsizei)ctx.height);
}

__declspec(dllexport) void bridge_flush_gl() {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    if (g_state.glFlush) g_state.glFlush();
}

__declspec(dllexport) void bridge_finish_gl() {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    if (g_state.glFinish) g_state.glFinish();
}

__declspec(dllexport) void* bridge_get_proc_address(const char* name) {
    if (!name) return nullptr;
    if (g_state.hGLES) {
        void* p = (void*)GetProcAddress(g_state.hGLES, name);
        if (p) return p;
    }
    if (g_state.hEGL) {
        void* p = (void*)GetProcAddress(g_state.hEGL, name);
        if (p) return p;
    }
    if (g_state.eglGetProcAddress) {
        return g_state.eglGetProcAddress(name);
    }
    return nullptr;
}

__declspec(dllexport) uint32_t bridge_lock_external_texture(
    uint32_t painter_id,
    uint64_t external_id,
    uintptr_t share_handle,
    uint32_t width,
    uint32_t height,
    uint32_t format_code,
    uint32_t* out_imported_new
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    if (out_imported_new) *out_imported_new = 0;

    for (auto& entry : g_state.imported_textures) {
        if (entry.painter_id == painter_id && entry.external_id == external_id) {
            if (entry.share_handle == share_handle && entry.width == width && entry.height == height && entry.pbuffer != EGL_NO_SURFACE) {
                if (!entry.bound) {
                    g_state.glBindTexture(GL_TEXTURE_2D, entry.gl_tex);
                    g_state.eglBindTexImage(g_state.egl_display, entry.pbuffer, EGL_BACK_BUFFER);
                    entry.bound = true;
                }
                return entry.gl_tex;
            }
            // Share handle or size changed: release old surface & texture
            if (entry.pbuffer != EGL_NO_SURFACE) {
                if (entry.bound) {
                    g_state.eglReleaseTexImage(g_state.egl_display, entry.pbuffer, EGL_BACK_BUFFER);
                }
                g_state.eglDestroySurface(g_state.egl_display, entry.pbuffer);
                if (g_state.active_egl_surfaces > 0) g_state.active_egl_surfaces--;
                g_state.released_egl_surfaces++;
                entry.pbuffer = EGL_NO_SURFACE;
            }
            if (entry.gl_tex != 0) {
                g_state.glDeleteTextures(1, &entry.gl_tex);
                entry.gl_tex = 0;
            }
            break;
        }
    }

    // If any other imported_textures entry is holding an EGLSurface for the same share_handle, release it first
    for (auto& other : g_state.imported_textures) {
        if (other.share_handle == share_handle && other.pbuffer != EGL_NO_SURFACE &&
            !(other.painter_id == painter_id && other.external_id == external_id)) {
            if (other.bound) {
                g_state.eglReleaseTexImage(g_state.egl_display, other.pbuffer, EGL_BACK_BUFFER);
                other.bound = false;
            }
            g_state.eglDestroySurface(g_state.egl_display, other.pbuffer);
            if (g_state.active_egl_surfaces > 0) g_state.active_egl_surfaces--;
            g_state.released_egl_surfaces++;
            other.pbuffer = EGL_NO_SURFACE;
            if (other.gl_tex != 0) {
                g_state.glDeleteTextures(1, &other.gl_tex);
                other.gl_tex = 0;
            }
        }
    }

    EGLConfig cfg = (format_code == 1 && g_state.egl_fp16_config)
        ? g_state.egl_fp16_config
        : g_state.egl_tex_config;
    EGLint attribs[] = {
        EGL_WIDTH, (EGLint)width,
        EGL_HEIGHT, (EGLint)height,
        EGL_TEXTURE_FORMAT, EGL_TEXTURE_RGBA,
        EGL_TEXTURE_TARGET, EGL_TEXTURE_2D,
        EGL_NONE
    };
    EGLSurface pbuf = g_state.eglCreatePbufferFromClientBuffer(
        g_state.egl_display,
        EGL_D3D_TEXTURE_2D_SHARE_HANDLE_ANGLE,
        (EGLClientBuffer)share_handle,
        cfg,
        attribs
    );
    if (!pbuf) {
        fprintf(stderr,"[Bridge][ERROR] eglCreatePbufferFromClientBuffer in lock_external_texture failed: 0x%X (handle=%p, %ux%u)\n",
            g_state.eglGetError(), (void*)share_handle, width, height);
        return 0;
    }
    g_state.active_egl_surfaces++;

    GLuint glTex = 0;
    g_state.glGenTextures(1, &glTex);
    g_state.glBindTexture(GL_TEXTURE_2D, glTex);
    g_state.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    g_state.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    g_state.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    g_state.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    if (!g_state.eglBindTexImage(g_state.egl_display, pbuf, EGL_BACK_BUFFER)) {
        fprintf(stderr,"[Bridge][ERROR] eglBindTexImage failed: 0x%X\n", g_state.eglGetError());
    }

    if (out_imported_new) *out_imported_new = 1;

    for (auto& entry : g_state.imported_textures) {
        if (entry.painter_id == painter_id && entry.external_id == external_id) {
            entry.share_handle = share_handle;
            entry.width = width;
            entry.height = height;
            entry.pbuffer = pbuf;
            entry.gl_tex = glTex;
            entry.bound = true;
            return glTex;
        }
    }

    ImportedExtTexEntry newEntry = {};
    newEntry.painter_id = painter_id;
    newEntry.external_id = external_id;
    newEntry.share_handle = share_handle;
    newEntry.width = width;
    newEntry.height = height;
    newEntry.pbuffer = pbuf;
    newEntry.gl_tex = glTex;
    newEntry.bound = true;
    g_state.imported_textures.push_back(newEntry);
    return glTex;
}

__declspec(dllexport) void bridge_unlock_external_texture(
    uint32_t painter_id,
    uint64_t external_id
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    for (auto& entry : g_state.imported_textures) {
        if (entry.painter_id == painter_id && entry.external_id == external_id) {
            // Note: keeping the pbuffer bound for same-share-handle reuse avoids redundant
            // SRV recreation in ANGLE while still allowing full release on resize/unregister.
            return;
        }
    }
}

__declspec(dllexport) void bridge_release_external_texture(
    uint32_t painter_id,
    uint64_t external_id
) {
    std::lock_guard<std::mutex> lock(g_state.mtx);
    for (auto it = g_state.imported_textures.begin(); it != g_state.imported_textures.end(); ) {
        if ((painter_id == 0 || it->painter_id == painter_id) && it->external_id == external_id) {
            if (it->pbuffer != EGL_NO_SURFACE) {
                if (it->bound) {
                    g_state.eglReleaseTexImage(g_state.egl_display, it->pbuffer, EGL_BACK_BUFFER);
                }
                g_state.eglDestroySurface(g_state.egl_display, it->pbuffer);
                if (g_state.active_egl_surfaces > 0) g_state.active_egl_surfaces--;
                g_state.released_egl_surfaces++;
            }
            if (it->gl_tex != 0) {
                g_state.glDeleteTextures(1, &it->gl_tex);
            }
            it = g_state.imported_textures.erase(it);
        } else {
            ++it;
        }
    }
}


}
