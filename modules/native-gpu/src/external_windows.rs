//! Engine-owned Vulkan/D3D11 interoperability. No pixel readback or CPU fence
//! waits. Native module callers must retain every lease until GPU use drains.
use ash::vk;
use std::{
    error::Error,
    ffi::{CStr, c_void},
};
pub type Result<T> = std::result::Result<T, Box<dyn Error>>;
pub const GENERAL: wgpu::TextureUses =
    wgpu::TextureUses::RESOURCE.union(wgpu::TextureUses::COPY_SRC);

pub fn available(adapter: &wgpu::Adapter) -> bool {
    unsafe {
        if !adapter
            .features()
            .contains(wgpu::Features::VULKAN_EXTERNAL_MEMORY_WIN32)
        {
            return false;
        }
        let Some(hal) = adapter.as_hal::<wgpu::hal::api::Vulkan>() else {
            return false;
        };
        hal.shared_instance()
            .raw_instance()
            .enumerate_device_extension_properties(hal.raw_physical_device())
            .is_ok_and(|items| {
                items.iter().any(|e| {
                    CStr::from_ptr(e.extension_name.as_ptr())
                        == ash::khr::external_semaphore_win32::NAME
                })
            })
    }
}

pub async fn open_device(adapter: &wgpu::Adapter,extra:wgpu::Features) -> Result<(wgpu::Device, wgpu::Queue, u64)> {
    unsafe {
        let required = extra | wgpu::Features::VULKAN_EXTERNAL_MEMORY_WIN32 | (adapter.features() & wgpu::Features::FLOAT32_BLENDABLE);
        if !adapter.features().contains(required) {
            return Err("E_NATIVE_INTEROP_UNAVAILABLE: Windows external memory unavailable".into());
        }
        let hal = adapter
            .as_hal::<wgpu::hal::api::Vulkan>()
            .ok_or("E_NATIVE_INTEROP_BACKEND: Vulkan required")?;
        let raw = hal.shared_instance().raw_instance();
        let physical = hal.raw_physical_device();
        if !raw
            .enumerate_device_extension_properties(physical)?
            .iter()
            .any(|e| {
                CStr::from_ptr(e.extension_name.as_ptr())
                    == ash::khr::external_semaphore_win32::NAME
            })
        {
            return Err(
                "E_NATIVE_INTEROP_UNAVAILABLE: external GPU semaphore extension unavailable".into(),
            );
        }
        let mut ids = vk::PhysicalDeviceIDProperties::default();
        raw.get_physical_device_properties2(
            physical,
            &mut vk::PhysicalDeviceProperties2::default().push_next(&mut ids),
        );
        if ids.device_luid_valid == 0 {
            return Err("E_NATIVE_INTEROP_ADAPTER: missing Windows GPU identity".into());
        }
        let luid = u64::from_ne_bytes(ids.device_luid);
        let limits = adapter.limits();
        let opened = hal.open_with_callback(
            required,
            &limits,
            &wgpu::MemoryHints::Performance,
            Some(Box::new(|args| {
                args.extensions
                    .push(ash::khr::external_semaphore_win32::NAME)
            })),
        )?;
        drop(hal);
        let (device, queue) = adapter.create_device_from_hal::<wgpu::hal::api::Vulkan>(
            opened,
            &wgpu::DeviceDescriptor {
                required_features: required,
                experimental_features:crate::ray_policy::experimental(required.contains(wgpu::Features::EXPERIMENTAL_RAY_QUERY)),
                required_limits: limits,
                ..Default::default()
            },
        )?;
        Ok((device, queue, luid))
    }
}

/// `handle` is a borrowed, validated NT handle supplied by the native module
/// owner, not an author-controlled integer. The owner keeps the allocation live.
pub unsafe fn import_bgra8(
    device: &wgpu::Device,
    handle: usize,
    width: u32,
    height: u32,
) -> Result<wgpu::Texture> {
    import_image(device,handle,width,height,wgpu::TextureFormat::Bgra8Unorm)
}

pub unsafe fn import_rgba32f(device:&wgpu::Device,handle:usize,width:u32,height:u32)->Result<wgpu::Texture>{
    import_image(device,handle,width,height,wgpu::TextureFormat::Rgba32Float)
}
unsafe fn import_image(device:&wgpu::Device,handle:usize,width:u32,height:u32,format:wgpu::TextureFormat)->Result<wgpu::Texture>{
    if handle == 0 || width == 0 || height == 0 || width>device.limits().max_texture_dimension_2d || height>device.limits().max_texture_dimension_2d
    {
        return Err("E_NATIVE_INTEROP_IMAGE: invalid bounded shared image".into());
    }
    let d = device
        .as_hal::<wgpu::hal::api::Vulkan>()
        .ok_or("E_NATIVE_INTEROP_BACKEND: Vulkan required")?;
    let desc = wgpu::hal::TextureDescriptor {
        label: Some("native-module/shared-image"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUses::RESOURCE
            | wgpu::TextureUses::COPY_SRC
            | wgpu::TextureUses::COPY_DST
            | wgpu::TextureUses::COLOR_TARGET,
        memory_flags: wgpu::hal::MemoryFlags::empty(),
        view_formats: vec![],
    };
    let imported = d.texture_from_d3d11_shared_handle(
        windows::Win32::Foundation::HANDLE(handle as *mut c_void),
        &desc,
    )?;
    drop(d);
    Ok(device.create_texture_from_hal::<wgpu::hal::api::Vulkan>(
        imported,
        &wgpu::TextureDescriptor {
            label: desc.label,
            size: desc.size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: desc.dimension,
            format: desc.format,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        },
        GENERAL,
    ))
}

pub unsafe fn import_fence(device: &wgpu::Device, handle: usize) -> Result<vk::Semaphore> {
    if handle == 0 {
        return Err("E_NATIVE_INTEROP_FENCE: missing shared fence".into());
    }
    let d = device
        .as_hal::<wgpu::hal::api::Vulkan>()
        .ok_or("E_NATIVE_INTEROP_BACKEND: Vulkan required")?;
    let mut ty = vk::SemaphoreTypeCreateInfo::default().semaphore_type(vk::SemaphoreType::TIMELINE);
    let semaphore = d
        .raw_device()
        .create_semaphore(&vk::SemaphoreCreateInfo::default().push_next(&mut ty), None)?;
    let api = ash::khr::external_semaphore_win32::Device::new(
        d.shared_instance().raw_instance(),
        d.raw_device(),
    );
    if let Err(e) = api.import_semaphore_win32_handle(
        &vk::ImportSemaphoreWin32HandleInfoKHR::default()
            .semaphore(semaphore)
            .handle_type(vk::ExternalSemaphoreHandleTypeFlags::D3D12_FENCE)
            .handle(handle as isize),
    ) {
        d.raw_device().destroy_semaphore(semaphore, None);
        return Err(e.into());
    }
    Ok(semaphore)
}

/// Separate raw encoders are necessary: wgpu30 forbids mixing raw and wgpu
/// commands in a single encoder. Submit acquire/work/release in that order.
pub unsafe fn ownership(
    device: &wgpu::Device,
    texture: &wgpu::Texture,
    acquire: bool,
) -> wgpu::CommandBuffer {
    let mut encoder = device.create_command_encoder(&Default::default());
    let d = device.as_hal::<wgpu::hal::api::Vulkan>().unwrap();
    let t = texture.as_hal::<wgpu::hal::api::Vulkan>().unwrap();
    let (src, dst) = if acquire {
        (vk::QUEUE_FAMILY_EXTERNAL, d.queue_family_index())
    } else {
        (d.queue_family_index(), vk::QUEUE_FAMILY_EXTERNAL)
    };
    let barrier = vk::ImageMemoryBarrier::default()
        .old_layout(vk::ImageLayout::GENERAL)
        .new_layout(vk::ImageLayout::GENERAL)
        .src_queue_family_index(src)
        .dst_queue_family_index(dst)
        .src_access_mask(if acquire {
            vk::AccessFlags::empty()
        } else {
            vk::AccessFlags::MEMORY_READ | vk::AccessFlags::MEMORY_WRITE
        })
        .dst_access_mask(if acquire {
            vk::AccessFlags::MEMORY_READ | vk::AccessFlags::MEMORY_WRITE
        } else {
            vk::AccessFlags::empty()
        })
        .image(t.raw_handle())
        .subresource_range(
            vk::ImageSubresourceRange::default()
                .aspect_mask(vk::ImageAspectFlags::COLOR)
                .level_count(1)
                .layer_count(1),
        );
    let raw = d.raw_device().clone();
    drop(t);
    drop(d);
    encoder.as_hal_mut::<wgpu::hal::api::Vulkan, _, _>(|cmd| {
        raw.cmd_pipeline_barrier(
            cmd.unwrap().raw_handle(),
            vk::PipelineStageFlags::ALL_COMMANDS,
            vk::PipelineStageFlags::ALL_COMMANDS,
            vk::DependencyFlags::empty(),
            &[],
            &[],
            &[barrier],
        )
    });
    encoder.finish()
}
pub fn general(encoder: &mut wgpu::CommandEncoder, texture: &wgpu::Texture) {
    encoder.transition_resources(
        std::iter::empty(),
        std::iter::once(wgpu::TextureTransition {
            texture,
            selector: None,
            state: GENERAL,
        }),
    );
}
pub unsafe fn wait(queue: &wgpu::Queue, semaphore: vk::Semaphore, value: u64) {
    queue
        .as_hal::<wgpu::hal::api::Vulkan>()
        .unwrap()
        .add_wait_semaphore(semaphore, Some(value), vk::PipelineStageFlags::ALL_COMMANDS);
}
pub unsafe fn signal(queue: &wgpu::Queue, semaphore: vk::Semaphore, value: u64) {
    queue
        .as_hal::<wgpu::hal::api::Vulkan>()
        .unwrap()
        .add_signal_semaphore(semaphore, Some(value));
}
pub unsafe fn destroy_fence(device: &wgpu::Device, semaphore: vk::Semaphore) {
    device
        .as_hal::<wgpu::hal::api::Vulkan>()
        .unwrap()
        .raw_device()
        .destroy_semaphore(semaphore, None);
}
