//! Engine-owned imported tensor buffers. No authored pointer/handle crosses IPC.
use crate::external_windows as fences;
use ash::vk;use std::{error::Error};
type Result<T>=std::result::Result<T,Box<dyn Error>>;
pub fn available(device:&wgpu::Device)->bool{unsafe{let Some(d)=device.as_hal::<wgpu::hal::api::Vulkan>()else{return false};let mut support=vk::ExternalBufferProperties::default();d.shared_instance().raw_instance().get_physical_device_external_buffer_properties(d.raw_physical_device(),&vk::PhysicalDeviceExternalBufferInfo::default().usage(vk::BufferUsageFlags::STORAGE_BUFFER|vk::BufferUsageFlags::TRANSFER_SRC|vk::BufferUsageFlags::TRANSFER_DST).handle_type(vk::ExternalMemoryHandleTypeFlags::D3D12_RESOURCE),&mut support);support.external_memory_properties.external_memory_features.contains(vk::ExternalMemoryFeatureFlags::IMPORTABLE)}}
pub unsafe fn import(device:&wgpu::Device,handle:usize,bytes:u64,allocation:u64)->Result<wgpu::Buffer>{
 if handle==0||bytes==0||bytes%4!=0||allocation<bytes||bytes>device.limits().max_buffer_size{return Err("invalid shared tensor byte lease".into());}
 let d=device.as_hal::<wgpu::hal::api::Vulkan>().ok_or("Vulkan tensor adapter required")?;let raw=d.raw_device();let instance=d.shared_instance().raw_instance();let physical=d.raw_physical_device();let kind=vk::ExternalMemoryHandleTypeFlags::D3D12_RESOURCE;
 let mut support=vk::ExternalBufferProperties::default();instance.get_physical_device_external_buffer_properties(physical,&vk::PhysicalDeviceExternalBufferInfo::default().usage(vk::BufferUsageFlags::STORAGE_BUFFER|vk::BufferUsageFlags::TRANSFER_SRC|vk::BufferUsageFlags::TRANSFER_DST).handle_type(kind),&mut support);
 if !support.external_memory_properties.external_memory_features.contains(vk::ExternalMemoryFeatureFlags::IMPORTABLE){return Err("adapter cannot import D3D12 tensor buffers".into());}
 let mut external=vk::ExternalMemoryBufferCreateInfo::default().handle_types(kind);let buffer=raw.create_buffer(&vk::BufferCreateInfo::default().size(bytes).usage(vk::BufferUsageFlags::STORAGE_BUFFER|vk::BufferUsageFlags::TRANSFER_SRC|vk::BufferUsageFlags::TRANSFER_DST).sharing_mode(vk::SharingMode::EXCLUSIVE).push_next(&mut external),None)?;
 let requirements=raw.get_buffer_memory_requirements(buffer);let api=ash::khr::external_memory_win32::Device::new(instance,raw);let mut props=vk::MemoryWin32HandlePropertiesKHR::default();
 if let Err(e)=api.get_memory_win32_handle_properties(kind,handle as isize,&mut props){raw.destroy_buffer(buffer,None);return Err(e.into());}
 let properties=instance.get_physical_device_memory_properties(physical);let bits=props.memory_type_bits&requirements.memory_type_bits;let ty=(0..properties.memory_type_count).find(|&i|bits&(1<<i)!=0&&properties.memory_types[i as usize].property_flags.contains(vk::MemoryPropertyFlags::DEVICE_LOCAL)).ok_or("no matching tensor memory type");
 let ty=match ty{Ok(v)=>v,Err(e)=>{raw.destroy_buffer(buffer,None);return Err(e.into());}};
 if allocation<requirements.size{raw.destroy_buffer(buffer,None);return Err("external tensor allocation is too small".into());}
 let mut external=vk::ImportMemoryWin32HandleInfoKHR::default().handle_type(kind).handle(handle as isize);let mut dedicated=vk::MemoryDedicatedAllocateInfo::default().buffer(buffer);
 let memory=match raw.allocate_memory(&vk::MemoryAllocateInfo::default().allocation_size(allocation).memory_type_index(ty).push_next(&mut external).push_next(&mut dedicated),None){Ok(v)=>v,Err(e)=>{raw.destroy_buffer(buffer,None);return Err(e.into());}};
 if let Err(e)=raw.bind_buffer_memory(buffer,memory,0){raw.destroy_buffer(buffer,None);raw.free_memory(memory,None);return Err(e.into());}
 let hal=wgpu::hal::vulkan::Buffer::from_raw_managed(buffer,memory,0,allocation);drop(d);
 Ok(device.create_buffer_from_hal::<wgpu::hal::api::Vulkan>(hal,&wgpu::BufferDescriptor{label:Some("inference/shared-tensor"),size:bytes,usage:wgpu::BufferUsages::STORAGE|wgpu::BufferUsages::COPY_SRC|wgpu::BufferUsages::COPY_DST,mapped_at_creation:false}))
}
pub unsafe fn ownership(device:&wgpu::Device,buffers:&[wgpu::Buffer],acquire:bool)->wgpu::CommandBuffer{
 let mut encoder=device.create_command_encoder(&Default::default());let d=device.as_hal::<wgpu::hal::api::Vulkan>().unwrap();let (src,dst)=if acquire{(vk::QUEUE_FAMILY_EXTERNAL,d.queue_family_index())}else{(d.queue_family_index(),vk::QUEUE_FAMILY_EXTERNAL)};
 let barriers=buffers.iter().map(|b|{let h=b.as_hal::<wgpu::hal::api::Vulkan>().unwrap();vk::BufferMemoryBarrier::default().buffer(h.raw_handle()).offset(0).size(vk::WHOLE_SIZE).src_queue_family_index(src).dst_queue_family_index(dst).src_access_mask(if acquire{vk::AccessFlags::empty()}else{vk::AccessFlags::MEMORY_READ|vk::AccessFlags::MEMORY_WRITE}).dst_access_mask(if acquire{vk::AccessFlags::MEMORY_READ|vk::AccessFlags::MEMORY_WRITE}else{vk::AccessFlags::empty()})}).collect::<Vec<_>>();let raw=d.raw_device().clone();drop(d);encoder.as_hal_mut::<wgpu::hal::api::Vulkan,_,_>(|cmd|raw.cmd_pipeline_barrier(cmd.unwrap().raw_handle(),vk::PipelineStageFlags::ALL_COMMANDS,vk::PipelineStageFlags::ALL_COMMANDS,vk::DependencyFlags::empty(),&[],&barriers,&[]));encoder.finish()
}
pub fn general(encoder:&mut wgpu::CommandEncoder,buffers:&[wgpu::Buffer]){encoder.transition_resources(buffers.iter().map(|buffer|wgpu::BufferTransition{buffer,state:wgpu::BufferUses::STORAGE_READ_WRITE}),std::iter::empty());}
pub use fences::{import_fence,wait,signal,destroy_fence};
